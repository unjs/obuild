import { builtinModules } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, join, basename, extname, resolve } from "pathe";
import { consola } from "consola";
import { colors as c } from "consola/utils";
import { rolldown } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { parseSync } from "rolldown/experimental";
import { resolveModulePath } from "exsolve";
import prettyBytes from "pretty-bytes";
import { distSize, fmtPath, sideEffectSize } from "../utils.ts";
import { makeExecutable, shebangPlugin } from "./plugins/shebang.ts";
import licensePlugin from "./plugins/license.ts";
import { defu } from "defu";

import type { OutputChunk, Plugin, InputOptions, OutputOptions } from "rolldown";

import type { Options as DtsOptions } from "rolldown-plugin-dts";
import type { BuildContext, BuildHooks, BundleEntry } from "../types.ts";

export async function rolldownBuild(
  ctx: BuildContext,
  entry: BundleEntry,
  hooks: BuildHooks,
): Promise<void> {
  const inputs: Record<string, string> = normalizeBundleInputs(entry.input, ctx);

  if (entry.stub) {
    for (const [distName, srcPath] of Object.entries(inputs)) {
      const distPath = join(ctx.pkgDir, "dist", `${distName}.mjs`);
      await mkdir(dirname(distPath), { recursive: true });
      consola.log(`${c.magenta("[bundle] ")} ${c.underline(fmtPath(distPath))} ${c.dim("(stub)")}`);
      const srcContents = await readFile(srcPath, "utf8");
      const parsed = parseSync(srcPath, srcContents);
      const exportNames = parsed.module.staticExports.flatMap((e) =>
        e.entries.map((e) => (e.exportName.kind === "Default" ? "default" : e.exportName.name)),
      );
      const hasDefaultExport = exportNames.includes("default");
      const firstLine = srcContents.split("\n")[0];
      const hasShebangLine = firstLine.startsWith("#!");
      const relativeSrcPath = relative(dirname(distPath), srcPath);
      await writeFile(
        distPath,
        `${hasShebangLine ? firstLine + "\n" : ""}export * from "${relativeSrcPath}";\n${hasDefaultExport ? `export { default } from "${relativeSrcPath}";\n` : ""}`,
        "utf8",
      );
      if (hasShebangLine) {
        await makeExecutable(distPath);
      }
      await writeFile(
        distPath.replace(/\.mjs$/, ".d.mts"),
        `export * from "${relativeSrcPath}";\n${hasDefaultExport ? `export { default } from "${relativeSrcPath}";\n` : ""}`,
        "utf8",
      );
    }
    return;
  }

  const rolldownConfig = defu(entry.rolldown, {
    cwd: ctx.pkgDir,
    input: inputs,
    plugins: [
      shebangPlugin(),
      licensePlugin({
        output: resolve(ctx.pkgDir, entry.outDir || "dist", "THIRD-PARTY-LICENSES.md"),
      }),
    ] as Plugin[],
    platform: "node",
    onLog(level, log, defaultHandler) {
      // Suppress EVAL warns
      if (log.code === "EVAL") {
        return;
      }
      defaultHandler(level, log);
    },
    resolve: {
      // Same as rolldown default for node platform but prefer "module" field over "main"
      mainFields: ["module", "main"],
    },
    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      ...[
        ...Object.keys(ctx.pkg.dependencies || {}),
        ...Object.keys(ctx.pkg.peerDependencies || {}),
      ].flatMap((p) => [p, new RegExp(`^${p}/`)]),
    ],
    treeshake: {
      moduleSideEffects: "no-external"
    }
  } satisfies InputOptions);

  if (entry.dts !== false) {
    rolldownConfig.plugins.push(...dts({ ...(entry.dts as DtsOptions) }));
  }

  await hooks.rolldownConfig?.(rolldownConfig, ctx);

  const res = await rolldown(rolldownConfig);

  const outDir = resolve(ctx.pkgDir, entry.outDir || "dist");

  const outConfig: OutputOptions = {
    dir: outDir,
    format: "esm",
    entryFileNames: "[name].mjs",
    chunkFileNames: "_chunks/[name].mjs",
    minify: entry.minify ?? "dce-only",
    codeSplitting: {
      groups: [
        {
          test: /node_modules/,
          name: (moduleId: string) => {
            const pkgName = moduleId.match(/.*\/node_modules\/(?<package>@[^/]+\/[^/]+|[^/]+)/)
              ?.groups?.package;
            const isDts = /\.d\.[mc]?ts$/.test(moduleId);
            return `libs/${pkgName || "common"}${isDts ? ".d" : ""}`;
          },
        },
      ],
    },
  };

  await hooks.rolldownOutput?.(outConfig, res, ctx);

  const { output } = await res.write(outConfig);

  await res.close();

  const outputEntries: {
    name: string;
    exports: string[];
    deps: string[];
    size: number;
    minSize: number;
    minGzipSize: number;
    sideEffectSize: number;
  }[] = [];

  const depsCache = new Map<OutputChunk, Set<string>>();
  const resolveDeps = (chunk: OutputChunk) => {
    let deps = depsCache.get(chunk);
    if (deps) {
      return [...deps].sort();
    }
    deps = new Set<string>();
    depsCache.set(chunk, deps);
    for (const id of chunk.imports) {
      if (builtinModules.includes(id) || id.startsWith("node:")) {
        deps.add(`[Node.js]`);
        continue;
      }
      const depChunk = output.find((o) => o.type === "chunk" && o.fileName === id) as
        | OutputChunk
        | undefined;
      if (depChunk) {
        for (const dep of resolveDeps(depChunk)) {
          deps.add(dep);
        }
        continue;
      }
      deps.add(id);
    }
    return [...deps].sort();
  };

  for (const chunk of output) {
    if (chunk.type !== "chunk" || !chunk.isEntry) continue;
    if (chunk.fileName.endsWith("ts")) continue;

    outputEntries.push({
      name: chunk.fileName,
      exports: chunk.exports,
      deps: resolveDeps(chunk),
      ...(await distSize(outDir, chunk.fileName)),
      sideEffectSize: await sideEffectSize(outDir, chunk.fileName),
    });
  }

  consola.log(
    `\n${outputEntries
      .map((o) =>
        [
          c.magenta(`[bundle] `) + `${c.underline(fmtPath(join(outDir, o.name)))}`,
          c.dim(
            `${c.bold("Size:")} ${prettyBytes(o.size)}, ${c.bold(prettyBytes(o.minSize))} minified, ${prettyBytes(o.minGzipSize)} min+gzipped (Side effects: ${prettyBytes(o.sideEffectSize)})`,
          ),
          o.exports.some((e) => e !== "default")
            ? c.dim(`${c.bold("Exports:")} ${o.exports.map((e) => e).join(", ")}`)
            : "",
          o.deps.length > 0 ? c.dim(`${c.bold("Dependencies:")} ${o.deps.join(", ")}`) : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n")}`,
  );
}

export function normalizeBundleInputs(
  input: string | string[],
  ctx: BuildContext,
): Record<string, string> {
  const inputs: Record<string, string> = {};

  for (let src of Array.isArray(input) ? input : [input]) {
    src = resolveModulePath(src, {
      from: ctx.pkgDir,
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
    });
    let relativeSrc = relative(join(ctx.pkgDir, "src"), src);
    if (relativeSrc.startsWith("..")) {
      relativeSrc = relative(join(ctx.pkgDir), src);
    }
    if (relativeSrc.startsWith("..")) {
      throw new Error(`Source should be within the package directory (${ctx.pkgDir}): ${src}`);
    }

    const distName = join(dirname(relativeSrc), basename(relativeSrc, extname(relativeSrc)));
    if (inputs[distName]) {
      throw new Error(
        `Rename one of the entries to avoid a conflict in the dist name "${distName}":\n - ${src}\n - ${inputs[distName]}`,
      );
    }
    inputs[distName] = src;
  }

  return inputs;
}

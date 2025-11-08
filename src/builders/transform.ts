import type { BuildContext, TransformEntry } from "../types.ts";

import { pathToFileURL } from "node:url";
import { dirname, extname, join, relative } from "pathe";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { consola } from "consola";
import { colors as c } from "consola/utils";
import { resolveModulePath, type ResolveOptions } from "exsolve";
import MagicString from "magic-string";
import { transform } from "oxc-transform";
import { parseAsync } from "oxc-parser";
import { fmtPath } from "../utils.ts";
import { glob } from "tinyglobby";
import { minify } from "oxc-minify";
import { makeExecutable, SHEBANG_RE } from "./plugins/shebang.ts";

/**
 * Transform all .ts modules in a directory using oxc-transform.
 */
export async function transformDir(
  ctx: BuildContext,
  entry: TransformEntry,
): Promise<void> {
  const promises: Promise<string>[] = [];

  for await (const entryName of await glob("**/*.*", { cwd: entry.input })) {
    if (entry.filter && (await entry.filter(entryName)) === false) {
      continue;
    }
    promises.push(
      (async () => {
        const entryPath = join(entry.input, entryName);
        const ext = extname(entryPath);
        switch (ext) {
          case ".ts": {
            {
              const transformed = await transformModule(entryPath, entry);
              const entryDistPath = join(
                entry.outDir!,
                entryName.replace(/\.ts$/, ".mjs"),
              );
              await mkdir(dirname(entryDistPath), { recursive: true });
              await writeFile(entryDistPath, transformed.code, "utf8");

              if (SHEBANG_RE.test(transformed.code)) {
                await makeExecutable(entryDistPath);
              }

              if (transformed.declaration) {
                await writeFile(
                  entryDistPath.replace(/\.mjs$/, ".d.mts"),
                  transformed.declaration,
                  "utf8",
                );
              }
              return entryDistPath;
            }
          }
          default: {
            {
              const entryDistPath = join(entry.outDir!, entryName);
              await mkdir(dirname(entryDistPath), { recursive: true });
              if (entry.stub) {
                await symlink(entryPath, entryDistPath, "junction").catch(
                  () => {
                    /* exists */
                  },
                );
              } else {
                const code = await readFile(entryPath, "utf8");
                await writeFile(entryDistPath, code, "utf8");
                if (SHEBANG_RE.test(code)) {
                  await makeExecutable(entryDistPath);
                }
              }
              return entryDistPath;
            }
          }
        }
      })(),
    );
  }

  const writtenFiles = await Promise.all(promises);

  consola.log(
    `\n${c.magenta("[transform] ")}${c.underline(fmtPath(entry.outDir!) + "/")}${entry.stub ? c.dim(" (stub)") : ""}\n${writtenFiles
      .map((f) => c.dim(fmtPath(f)))
      .join("\n\n")}`,
  );
}

/**
 * Transform a .ts module using oxc-transform.
 */
async function transformModule(entryPath: string, entry: TransformEntry) {
  if (entry.stub) {
    return {
      code: `export * from ${JSON.stringify(entryPath)};`,
      declaration: `export * from ${JSON.stringify(entryPath)};`,
    };
  }

  let sourceText = await readFile(entryPath, "utf8");

  const sourceOptions = {
    lang: "ts",
    sourceType: "module",
  } as const;

  const parsed = await parseAsync(entryPath, sourceText, {
    ...sourceOptions,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`Errors while parsing ${entryPath}:`, {
      cause: parsed.errors,
    });
  }

  const resolveOptions: ResolveOptions = {
    ...entry.resolve,
    from: pathToFileURL(entryPath),
    extensions: entry.resolve?.extensions ?? [
      ".ts",
      ".js",
      ".mjs",
      ".cjs",
      ".json",
    ],
    suffixes: entry.resolve?.suffixes ?? ["", "/index"],
  };

  const magicString = new MagicString(sourceText);

  // Rewrite relative imports
  const updatedStarts = new Set<number>();
  const rewriteSpecifier = (req: {
    value: string;
    start: number;
    end: number;
  }) => {
    const moduleId = req.value;
    if (!moduleId.startsWith(".")) {
      return;
    }
    if (updatedStarts.has(req.start)) {
      return; // prevent double rewritings
    }
    updatedStarts.add(req.start);
    const resolvedAbsolute = resolveModulePath(moduleId, resolveOptions);
    const newId = relative(
      dirname(entryPath),
      resolvedAbsolute.replace(/\.ts$/, ".mjs"),
    );
    magicString.remove(req.start, req.end);
    magicString.prependLeft(
      req.start,
      JSON.stringify(newId.startsWith(".") ? newId : `./${newId}`),
    );
  };

  for (const staticImport of parsed.module.staticImports) {
    rewriteSpecifier(staticImport.moduleRequest);
  }

  for (const staticExport of parsed.module.staticExports) {
    for (const staticExportEntry of staticExport.entries) {
      if (staticExportEntry.moduleRequest) {
        rewriteSpecifier(staticExportEntry.moduleRequest);
      }
    }
  }

  sourceText = magicString.toString();

  const transformed = transform(entryPath, sourceText, {
    ...entry.oxc,
    ...sourceOptions,
    cwd: dirname(entryPath),
    typescript: {
      declaration: { stripInternal: true },
      ...entry.oxc?.typescript,
    },
  });

  const transformErrors = transformed.errors.filter(
    (err) => !err.message.includes("--isolatedDeclarations"),
  );

  if (transformErrors.length > 0) {
    // console.log(sourceText);
    await writeFile(
      "build-dump.ts",
      `/** Error dump for ${entryPath} */\n\n` + sourceText,
      "utf8",
    );
    throw new Error(
      `Errors while transforming ${entryPath}: (hint: check build-dump.ts)`,
      {
        cause: transformErrors,
      },
    );
  }

  if (entry.minify) {
    const res = minify(
      entryPath,
      transformed.code,
      entry.minify === true ? {} : entry.minify,
    );
    transformed.code = res.code;
    transformed.map = res.map;
  }

  return transformed;
}

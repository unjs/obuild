import type { BuildContext, BundleEntry, BuildOptions } from "../types.ts";

import { resolve } from "node:path";
import { builtinModules } from "node:module";
import { consola } from "consola";
import { rolldown } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { fmtPath } from "../utils.ts";
import { resolveModulePath } from "exsolve";

export async function rolldownBuild(
  ctx: BuildContext,
  entry: BundleEntry,
  opts: BuildOptions,
): Promise<void> {
  const start = Date.now();

  const input = (Array.isArray(entry.input) ? entry.input : [entry.input]).map(
    (i) =>
      resolveModulePath(i, { try: true, extensions: [".ts", ".mjs", ".js"] }) ||
      i,
  );

  const res = await rolldown({
    cwd: ctx.pkgDir,
    input: input,
    plugins: [dts({ isolatedDeclarations: true })],
    resolve: {
      tsconfigFilename: opts.tsconfigPath
        ? resolve(opts.tsconfigPath)
        : undefined,
    },
    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      ...Object.keys(ctx.pkg.dependencies || {}),
      ...Object.keys(ctx.pkg.peerDependencies || {}),
    ],
  });

  await res.write({
    dir: entry.outDir,
    entryFileNames: "[name].mjs",
    chunkFileNames: "[name].mjs",
  });

  await res.close();

  consola.log(
    `Bundled \`${input.map((i) => fmtPath(i)).join(", ")}\` to \`${fmtPath(entry.outDir!)}\` in ${Date.now() - start}ms`,
  );
}

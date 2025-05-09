import type { BuildContext, BuildHooks, BundleEntry } from "../types.ts";

import { builtinModules } from "node:module";
import { consola } from "consola";
import { type InputOptions, rolldown } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { fmtPath } from "../utils.ts";
import { resolveModulePath } from "exsolve";

export async function rolldownBuild(
  ctx: BuildContext,
  entry: BundleEntry,
  hooks: BuildHooks,
): Promise<void> {
  const start = Date.now();

  const input = (Array.isArray(entry.input) ? entry.input : [entry.input]).map(
    (i) =>
      resolveModulePath(i, { try: true, extensions: [".ts", ".mjs", ".js"] }) ||
      i,
  );

  const rolldownConfig: InputOptions = {
    cwd: ctx.pkgDir,
    input: input,
    plugins: [dts({ isolatedDeclarations: entry.declaration })],
    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      ...[
        ...Object.keys(ctx.pkg.dependencies || {}),
        ...Object.keys(ctx.pkg.peerDependencies || {}),
      ].flatMap((p) => [p, new RegExp(`^${p}/`)]),
    ],
  };

  await hooks.rolldownConfig?.(rolldownConfig, ctx);

  const res = await rolldown(rolldownConfig);

  await res.write({
    dir: entry.outDir,
    entryFileNames: "[name].mjs",
    chunkFileNames: "[name].mjs",
    minify: entry.minify,
  });

  await res.close();

  consola.log(
    `Bundled \`${input.map((i) => fmtPath(i)).join(", ")}\` to \`${fmtPath(entry.outDir!)}\` in ${Date.now() - start}ms`,
  );
}

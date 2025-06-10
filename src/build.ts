import type {
  BuildContext,
  BuildConfig,
  TransformEntry,
  BundleEntry,
} from "./types.ts";

import { rm } from "node:fs/promises";
import { consola } from "consola";
import { colors as c } from "consola/utils";
import { rolldownBuild } from "./builders/bundle.ts";
import { transformDir } from "./builders/transform.ts";
import { fmtPath, analyzeDir, normalizePath } from "./utils.ts";
import prettyBytes from "pretty-bytes";
import { readPackageJSON } from "pkg-types";

/**
 * Build dist/ from src/
 */
export async function build(config: BuildConfig): Promise<void> {
  const start = Date.now();

  const pkgDir = normalizePath(config.cwd);
  const pkg = await readPackageJSON(pkgDir);
  const ctx: BuildContext = {
    pkg,
    pkgDir,
  };

  consola.log(
    `📦 Building \`${ctx.pkg.name || "<no name>"}\` (\`${ctx.pkgDir}\`)`,
  );

  const hooks = config.hooks || {};

  await hooks.start?.(ctx);

  const entries = (config.entries || []).map((rawEntry) => {
    let entry: TransformEntry | BundleEntry;

    if (typeof rawEntry === "string") {
      const [input, outDir] = rawEntry.split(":") as [
        string,
        string | undefined,
      ];
      entry = input.endsWith("/")
        ? ({ type: "transform", input, outDir } as TransformEntry)
        : ({ type: "bundle", input: input.split(","), outDir } as BundleEntry);
    } else {
      entry = rawEntry;
    }

    if (!entry.input) {
      throw new Error(
        `Build entry missing \`input\`: ${JSON.stringify(entry, null, 2)}`,
      );
    }
    entry = { ...entry };
    entry.outDir = normalizePath(entry.outDir || "dist", pkgDir);
    entry.input = Array.isArray(entry.input)
      ? entry.input.map((p) => normalizePath(p, pkgDir))
      : normalizePath(entry.input, pkgDir);
    return entry;
  });

  await hooks.entries?.(entries, ctx);

  const outDirs: Array<string> = [];
  for (const outDir of entries.map((e) => e.outDir).sort() as string[]) {
    if (!outDirs.some((dir) => outDir.startsWith(dir))) {
      outDirs.push(outDir);
    }
  }
  for (const outDir of outDirs) {
    consola.log(`🧻 Cleaning up \`${fmtPath(outDir)}\``);
    await rm(outDir, { recursive: true, force: true });
  }

  for (const entry of entries) {
    await (entry.type === "bundle"
      ? rolldownBuild(ctx, entry, hooks)
      : transformDir(ctx, entry));
  }

  await hooks.end?.(ctx);

  const dirSize = analyzeDir(outDirs);
  consola.log(
    c.dim(
      `\nΣ Total dist byte size: ${c.underline(prettyBytes(dirSize.size))} (${c.underline(dirSize.files)} files)`,
    ),
  );

  consola.log(`\n✅ obuild finished in ${Date.now() - start}ms`);
}

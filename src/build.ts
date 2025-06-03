import type {
  BuildContext,
  BuildConfig,
  TransformEntry,
  BundleEntry,
  BuildEntry,
} from "./types.ts";

import { join } from "pathe";
import { rm } from "node:fs/promises";
import { consola } from "consola";
import { colors as c } from "consola/utils";
import { fmtPath, analyzeDir, normalizePath } from "./utils.ts";
import prettyBytes from "pretty-bytes";

/**
 * Build dist/ from src/
 */
export async function build(config: BuildConfig): Promise<void> {
  const ctx: BuildContext = await resolveContext(config);
  const start = Date.now();

  consola.log(
    `📦 Building \`${ctx.pkg.name || "<no name>"}\` (\`${ctx.pkgDir}\`)`,
  );

  const outDirs = await runBuild(config, ctx);

  printAnalytics(outDirs);

  consola.log(`\n✅ obuild finished in ${Date.now() - start}ms`);
}

export async function runBuild(
  config: BuildConfig & { preserveOutDirs?: boolean },
  ctx: BuildContext,
): Promise<string[]> {
  const hooks = config.hooks || {};

  await hooks.start?.(ctx);

  const entries = resolveEntries(ctx.pkgDir, config.entries);

  await hooks.entries?.(entries, ctx);

  const outDirs = await prepareOutDirs(entries, config.preserveOutDirs);

  for (const entry of entries) {
    if (entry.type === "bundle") {
      const { rolldownBuild } = await import("./builders/bundle.ts");
      await rolldownBuild(ctx, entry as BundleEntry, hooks);
      continue;
    }

    const { transformDir } = await import("./builders/transform.ts");
    await transformDir(ctx, entry as TransformEntry);
  }

  await hooks.end?.(ctx);

  return outDirs;
}

export function printAnalytics(outDirs: string[]): void {
  const dirSize = analyzeDir(outDirs);

  consola.log(
    c.dim(
      `\nΣ Total dist byte size: ${c.underline(prettyBytes(dirSize.size))} (${c.underline(dirSize.files)} files)`,
    ),
  );
}

export async function resolveContext(
  config: BuildConfig,
): Promise<BuildContext> {
  const pkgDir = normalizePath(config.cwd);
  const pkg = await readJSON(join(pkgDir, "package.json")).catch(() => ({}));
  return { pkg, pkgDir };
}

export function resolveEntries(
  pkgDir: string,
  rawEntries: Array<string | BuildEntry> = [],
): BuildEntry[] {
  return rawEntries.map((rawEntry) => {
    let entry: BuildEntry;

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
}

export async function prepareOutDirs(
  entries: BuildEntry[],
  preserveFiles?: boolean,
): Promise<string[]> {
  const outDirs: Array<string> = [];
  for (const outDir of entries.map((e) => e.outDir).sort() as string[]) {
    if (!outDirs.some((dir) => outDir.startsWith(dir))) {
      outDirs.push(outDir);
    }
  }

  if (preserveFiles === true) {
    return outDirs;
  }

  await Promise.all(
    outDirs.map(async (outDir) => {
      consola.log(`🧻 Cleaning up \`${fmtPath(outDir)}\``);

      return rm(outDir, { recursive: true, force: true });
    }),
  );

  return outDirs;
}

function readJSON(specifier: string) {
  return import(specifier, {
    with: { type: "json" },
  }).then((r) => r.default);
}

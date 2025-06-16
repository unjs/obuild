import { existsSync } from "node:fs";
import type { PackageJson } from "pkg-types";
import type { BuildEntry } from "./types.ts";
import { normalize, resolve } from "pathe";
import { extractExportFilenames } from "./utils.ts";

type InferEntriesResult = {
  entries: BuildEntry[];
  dts?: boolean;
  warnings: string[];
};

/**
 * @param {PackageJson} pkg The contents of a package.json file to serve as the source for inferred entries.
 * @param {string[]} sourceFiles A list of source files to use for inferring entries.
 * @param {string | undefined} rootDir The root directory of the project.
 */
export function inferEntries(
  pkg: PackageJson,
  sourceFiles: string[],
  rootDir?: string,
): InferEntriesResult {
  const warnings = [];

  // Sort files so least-nested files are first
  sourceFiles.sort((a, b) => a.split("/").length - b.split("/").length);

  // Come up with a list of all output files & their formats
  const outputs = extractExportFilenames(pkg.exports);

  if (pkg.bin) {
    const binaries =
      typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin);
    for (const file of binaries) {
      outputs.push({ file });
    }
  }
  if (pkg.main) {
    outputs.push({ file: pkg.main });
  }
  if (pkg.module) {
    outputs.push({ type: "esm", file: pkg.module });
  }
  if (pkg.types || pkg.typings) {
    outputs.push({ file: pkg.types || pkg.typings! });
  }

  // Try to detect output types
  const isESMPkg = pkg.type === "module";
  for (const output of outputs.filter((o) => !o.type)) {
    const isJS = output.file.endsWith(".js");
    if ((isESMPkg && isJS) || output.file.endsWith(".mjs")) {
      output.type = "esm";
    }
  }

  let dts = false;

  // Infer entries from package files
  const entries: BuildEntry[] = [];
  for (const output of outputs) {
    // Supported output file extensions are `.d.ts`, and `.mjs`
    // But we support any file extension here in case user has extended rolldown options
    const outputSlug = output.file.replace(
      /(\*[^/\\]*|\.d\.(m)?ts|\.\w+)$/,
      "",
    );
    const isDir = outputSlug.endsWith("/");

    // Skip top level directory
    if (isDir && ["./", "/"].includes(outputSlug)) {
      continue;
    }

    const possiblePaths = getEntrypointPaths(outputSlug);
    // eslint-disable-next-line unicorn/no-array-reduce
    const input = possiblePaths.reduce<string | undefined>((source, d) => {
      if (source) {
        return source;
      }
      const SOURCE_RE = new RegExp(
        `(?<=/|$)${d}${isDir ? "" : String.raw`\.\w+`}$`,
      );
      return sourceFiles
        .find((i) => SOURCE_RE.test(i))
        ?.replace(/(\.d\.(m)?ts|\.\w+)$/, "");
    }, undefined as any);

    if (!input) {
      if (!existsSync(resolve(rootDir || ".", output.file))) {
        warnings.push(`Could not find entrypoint for \`${output.file}\``);
      }
      continue;
    }

    const entry =
      entries.find((i) => i.input === input) ||
      entries[entries.push({ input, type: 'bundle' }) - 1];

    if (/\.d\.(m)?ts$/.test(output.file)) {
      dts = true;
    }

    if (isDir) {
      entry.outDir = outputSlug;
    }
  }

  return { entries, dts, warnings };
}

export const getEntrypointPaths = (path: string): string[] => {
  const segments = normalize(path).split("/");
  return segments
    .map((_, index) => segments.slice(index).join("/"))
    .filter(Boolean);
};

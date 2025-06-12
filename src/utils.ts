import { readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { join, resolve } from "pathe";
import { type Plugin, rolldown } from "rolldown";
import { minify } from "oxc-minify";
import type { PackageJson } from "pkg-types";

export function fmtPath(path: string): string {
  return resolve(path).replace(process.cwd(), ".");
}

export function analyzeDir(dir: string | string[]): {
  size: number;
  files: number;
} {
  if (Array.isArray(dir)) {
    let totalSize = 0;
    let totalFiles = 0;
    for (const d of dir) {
      const { size, files } = analyzeDir(d);
      totalSize += size;
      totalFiles += files;
    }
    return { size: totalSize, files: totalFiles };
  }

  let totalSize = 0;

  const files = readdirSync(dir, { withFileTypes: true, recursive: true });

  for (const file of files) {
    const fullPath = join(file.parentPath, file.name);
    if (file.isFile()) {
      const { size } = statSync(fullPath);
      totalSize += size;
    }
  }

  return { size: totalSize, files: files.length };
}

export async function distSize(
  dir: string,
  entry: string,
): Promise<{
  size: number;
  minSize: number;
  minGzipSize: number;
}> {
  const build = await rolldown({
    input: join(dir, entry),
    plugins: [],
    platform: "neutral",
    external: (id) => id[0] !== "." && !id.startsWith(dir),
  });

  const { output } = await build.generate({
    inlineDynamicImports: true,
  });

  const code = output[0].code;
  const { code: minified } = await minify(entry, code);

  return {
    size: Buffer.byteLength(code),
    minSize: Buffer.byteLength(minified),
    minGzipSize: gzipSync(minified).length,
  };
}

export async function sideEffectSize(
  dir: string,
  entry: string,
): Promise<number> {
  const virtualEntry: Plugin = {
    name: "virtual-entry",
    async resolveId(id, importer, opts) {
      if (id === "#entry") {
        return { id };
      }
      const resolved = await this.resolve(id, importer, opts);
      if (!resolved) {
        return null;
      }
      resolved.moduleSideEffects = null;
      return resolved;
    },
    load(id) {
      if (id === "#entry") {
        return /* js */ `import * as _lib from "${join(dir, entry)}";`;
      }
    },
  };

  const build = await rolldown({
    input: "#entry",
    platform: "neutral",
    external: (id) => id[0] !== "." && !id.startsWith(dir),
    plugins: [virtualEntry],
  });

  const { output } = await build.generate({
    inlineDynamicImports: true,
  });

  if (process.env.INSPECT_BUILD) {
    console.log("---------[side effects]---------");
    console.log(entry);
    console.log(output[0].code);
    console.log("-------------------------------");
  }

  return Buffer.byteLength(output[0].code.trim());
}

export function listRecursively(path: string): string[] {
  const filenames = new Set<string>();
  const walk = (path: string): void => {
    const files = readdirSync(path);
    for (const file of files) {
      const fullPath = resolve(path, file);
      if (statSync(fullPath).isDirectory()) {
        filenames.add(fullPath + "/");
        walk(fullPath);
      } else {
        filenames.add(fullPath);
      }
    }
  };
  walk(path);
  return [...filenames];
}

export function inferExportType(
  condition: string,
  previousConditions: string[] = [],
  filename = "",
): "esm" | "cjs" {
  if (filename) {
    if (filename.endsWith(".d.ts")) {
      return "esm";
    }
    if (filename.endsWith(".mjs")) {
      return "esm";
    }
    if (filename.endsWith(".cjs")) {
      return "cjs";
    }
  }
  switch (condition) {
    case "import": {
      return "esm";
    }
    case "require": {
      return "cjs";
    }
    default: {
      if (previousConditions.length === 0) {
        // TODO: Check against type:module for default
        return "esm";
      }
      const [newCondition, ...rest] = previousConditions;
      return inferExportType(newCondition, rest, filename);
    }
  }
}

export type OutputDescriptor = { file: string; type?: "esm" | "cjs" };

export function extractExportFilenames(
  exports: PackageJson["exports"],
  conditions: string[] = [],
): OutputDescriptor[] {
  if (!exports) {
    return [];
  }
  if (typeof exports === "string") {
    return [{ file: exports, type: "esm" }];
  }
  return (
    Object.entries(exports)
      // Filter out .json subpaths such as package.json
      .filter(([subpath]) => !subpath.endsWith(".json"))
      .flatMap(([condition, exports]) =>
        typeof exports === "string"
          ? {
            file: exports,
            type: inferExportType(condition, conditions, exports),
          }
          : extractExportFilenames(exports, [...conditions, condition]),
      )
  );
}

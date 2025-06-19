import { readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "pathe";

import { type Plugin, rolldown } from "rolldown";
import { minify } from "oxc-minify";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

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

export function normalizePath(
  path: string | URL | undefined,
  resolveFrom?: string,
): string {
  return typeof path === "string" && isAbsolute(path)
    ? path
    : path instanceof URL
      ? fileURLToPath(path)
      : resolve(resolveFrom || ".", path || ".");
}

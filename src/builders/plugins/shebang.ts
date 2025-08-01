// Ported from https://github.com/unjs/unbuild/blob/main/src/builders/rollup/plugins/shebang.ts

import { promises as fsp } from "node:fs";
import { resolve } from "pathe";
import type { Plugin } from "rolldown";

const SHEBANG_RE: RegExp = /^#![^\n]*/;

export function shebangPlugin(): Plugin {
  return {
    name: "obuild-shebang",
    async writeBundle(options, bundle): Promise<void> {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") {
          continue;
        }
        if (hasShebang(output.code)) {
          const outFile = resolve(options.dir!, fileName);
          await makeExecutable(outFile);
        }
      }
    },
  };
}

/**
 * Checks if a file contains a shebang in the first `bytes` bytes.
 *
 * @param filePath - Path to the file to check for a shebang
 * @param bytes - Number of bytes to read from the start of the file to check for a shebang
 * @returns - Returns true if the file contains a shebang, false otherwise
 */
export async function hasFileShebang(
  filePath: string,
  bytes: number = 256,
): Promise<boolean> {
  let shebangFound = false;
  const fd = await fsp.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(bytes), 0, bytes);
    shebangFound = hasShebang(buffer.subarray(0, bytesRead).toString());
  } finally {
    await fd.close();
  }
  return shebangFound;
}

export function hasShebang(code: string): boolean {
  return SHEBANG_RE.test(code);
}

export async function makeExecutable(filePath: string): Promise<void> {
  await fsp.chmod(filePath, 0o755 /* rwx r-x r-x */).catch(() => {});
}

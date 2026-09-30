import { brotliCompressSync, constants as zlib, deflateRawSync } from "node:zlib";
import MagicString from "magic-string";
import { minifySync, parseSync } from "rolldown/utils";
import { isLibChunk } from "../../utils.ts";

import type { Plugin } from "rolldown";
import type { CompressLibsOptions } from "../../types.ts";

/**
 * Compress `libs/<pkg>` chunks (see `codeSplitting.groups`) into self-extracting ES modules,
 * optionally only for listed packages.
 *
 * Import/export statements are kept as-is so the module graph stays static. The rest of the
 * chunk is compressed, base122-encoded into a string literal and evaluated with `new Function`,
 * receiving imported bindings as arguments (explicit references keep working when the output
 * is transformed or re-bundled, unlike a direct `eval`).
 */
export function compressLibsPlugin(opts: CompressLibsOptions): Plugin {
  return {
    name: "obuild:compress-libs",
    generateBundle(_outputOptions, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (!isLibChunk(chunk, opts.include || true)) continue;
        let code: string;
        try {
          code = compressModule(chunk.fileName, chunk.code, opts);
        } catch (error) {
          this.warn(`Skipped compressing ${chunk.fileName}: ${(error as Error).message}`);
          continue;
        }
        // Tiny chunks do not benefit from compression
        if (Buffer.byteLength(code) >= Buffer.byteLength(chunk.code)) continue;
        chunk.code = code;
        chunk.map = null;
        if (chunk.sourcemapFileName) {
          delete bundle[chunk.sourcemapFileName];
          chunk.sourcemapFileName = null;
        }
      }
    },
  };
}

const META = "__obuild_meta";
const IMPORT = "__obuild_import";
const ZLIB = "__obuild_zlib";
const DECOMPRESS = "__obuild_decompress";
const BYTES = "__obuild_bytes";
const SOURCE = "__obuild_source";

type Algorithm = NonNullable<CompressLibsOptions["algorithm"]>;

const algorithms: Record<
  Algorithm,
  {
    compress: (input: Buffer, level?: number) => Buffer;
    /** Runtime statements producing the `SOURCE` string from `BYTES` */
    runtime: (bytes: string) => string[];
  }
> = {
  // Node.js: sync `zlib` via `process.getBuiltinModule`; elsewhere `DecompressionStream` (top-level await)
  deflate: {
    compress: (input, level = 9) => deflateRawSync(input, { level, memLevel: 9 }),
    runtime: (bytes) => [
      `const ${ZLIB} = globalThis.process?.getBuiltinModule?.("node:zlib");`,
      `const ${BYTES} = ${bytes};`,
      `const ${SOURCE} = ${ZLIB} ? ${ZLIB}.inflateRawSync(${BYTES}).toString() : await new Response(new Blob([${BYTES}]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();`,
    ],
  },
  // Node.js only: no browser fallback (`DecompressionStream("brotli")` is not supported by Chromium),
  // but also no top-level await, so chunks stay loadable with `require(esm)`
  brotli: {
    compress: (input, level = 11) =>
      brotliCompressSync(input, {
        params: {
          [zlib.BROTLI_PARAM_QUALITY]: level,
          [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
          [zlib.BROTLI_PARAM_LGWIN]: zlib.BROTLI_MAX_WINDOW_BITS,
          [zlib.BROTLI_PARAM_SIZE_HINT]: input.length,
        },
      }),
    runtime: (bytes) => [
      `import { brotliDecompressSync as ${DECOMPRESS} } from "node:zlib";`,
      `const ${SOURCE} = ${DECOMPRESS}(${bytes}).toString();`,
    ],
  },
};

export function compressModule(
  fileName: string,
  code: string,
  opts: Pick<CompressLibsOptions, "algorithm" | "level"> = {},
): string {
  code = code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n");
  const {
    program,
    module: mod,
    errors,
  } = parseSync(fileName, code, {
    sourceType: "module",
  });
  if (errors.length > 0) {
    throw new Error(errors[0].message);
  }

  const s = new MagicString(code);
  const header: string[] = [];
  const importBindings = new Set<string>();
  const exportSpecifiers: string[] = [];
  const exportLocals = new Set<string>();

  const addExport = (local: string, exported: string) => {
    exportSpecifiers.push(local === exported ? local : `${local} as ${fmtExportName(exported)}`);
    if (!importBindings.has(local)) {
      exportLocals.add(local);
    }
  };

  for (const node of program.body) {
    switch (node.type) {
      // Kept as-is in the module scope
      case "ImportDeclaration":
      case "ExportAllDeclaration": {
        header.push(code.slice(node.start, node.end));
        s.remove(node.start, node.end);
        for (const spec of node.type === "ImportDeclaration" ? node.specifiers : []) {
          importBindings.add(spec.local.name);
        }
        break;
      }
      case "ExportNamedDeclaration": {
        if (node.source) {
          header.push(code.slice(node.start, node.end));
          s.remove(node.start, node.end);
        } else if (node.declaration) {
          // `export const|let|var|function|class ...` -> keep the declaration inside the payload
          s.remove(node.start, node.declaration.start);
          // Module record resolves binding names from destructuring patterns
          for (const exp of mod.staticExports) {
            if (exp.start !== node.start) continue;
            for (const entry of exp.entries) {
              addExport(entry.localName.name!, entry.exportName.name!);
            }
          }
        } else {
          s.remove(node.start, node.end);
          for (const spec of node.specifiers) {
            addExport(moduleExportName(spec.local), moduleExportName(spec.exported));
          }
        }
        break;
      }
      case "ExportDefaultDeclaration": {
        throw new Error("`export default` declarations are not supported");
      }
    }
  }

  // `import.meta` and `import()` are module-only syntax; route them through module scope helpers
  for (const span of mod.importMetas) {
    s.overwrite(span.start, span.end, META);
  }
  for (const dynImport of mod.dynamicImports) {
    s.overwrite(dynImport.start, dynImport.start + "import".length, IMPORT);
  }

  const params = [...importBindings];
  const args = [...importBindings];
  if (mod.importMetas.length > 0) {
    params.push(META);
    args.push("import.meta");
  }
  if (mod.dynamicImports.length > 0) {
    params.push(IMPORT);
    args.push("(id, opts) => import(id, opts)");
  }

  // Function body returning exported bindings
  const body = `"use strict";${s.toString().trim()}\n;return {${[...exportLocals].join(",")}}`;
  const check = parseSync(fileName, `(function(${params.join(",")}){${body}\n})`, {
    sourceType: "script",
  });
  if (check.errors.length > 0) {
    // e.g. top-level await
    throw new Error(check.errors[0].message);
  }

  const algorithm = algorithms[opts.algorithm || "brotli"];
  if (!algorithm) {
    throw new Error(`Unknown compression algorithm: ${opts.algorithm}`);
  }
  const compressed = algorithm.compress(Buffer.from(body), opts.level);
  const bytes = `${base122DecodeSource()}("${base122Encode(compressed)}")`;

  return [
    ...header,
    ...algorithm.runtime(bytes),
    `const {${[...exportLocals].join(",")}} = new Function(${[...params.map((p) => JSON.stringify(p)), SOURCE].join(", ")})(${args.join(", ")});`,
    exportSpecifiers.length > 0 ? `export { ${exportSpecifiers.join(", ")} };` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

function moduleExportName(node: { type: string; name?: string; value?: unknown }): string {
  return node.type === "Identifier" ? node.name! : String(node.value);
}

function fmtExportName(name: string): string {
  return /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u.test(name) ? name : JSON.stringify(name);
}

// 7-bit groups that cannot appear raw in a double-quoted string literal
// (NUL is legal, but makes tools treat the file as binary)
const BASE122_ILLEGAL = [0, 10, 13, 34, 92];

/**
 * base122-style encoding (UTF-8 aware): each 7-bit group becomes a 1-byte UTF-8 char;
 * a group that is illegal in a string literal is folded with the following group into a
 * 2-byte UTF-8 char (`(illegalIndex + 1) << 7 | next`, or `(illegalIndex + 6) << 7` when last).
 *
 * ~14.3% size overhead (vs ~22.6% for basE91-style base93 and ~33.3% for base64), same decode speed as base93.
 */
export function base122Encode(data: Uint8Array): string {
  const groups = new Uint8Array(Math.ceil((data.length * 8) / 7));
  let g = 0;
  let b = 0;
  let n = 0;
  for (const byte of data) {
    b |= byte << n;
    n += 8;
    while (n >= 7) {
      groups[g++] = b & 127;
      b >>= 7;
      n -= 7;
    }
  }
  if (n > 0) groups[g++] = b & 127;
  const out = new Uint16Array(g);
  let p = 0;
  for (let i = 0; i < g; i++) {
    const k = BASE122_ILLEGAL.indexOf(groups[i]);
    if (k < 0) out[p++] = groups[i];
    else if (i + 1 < g) out[p++] = ((k + 1) << 7) | groups[++i];
    else out[p++] = (k + 6) << 7;
  }
  return Buffer.from(out.buffer, 0, p * 2).toString("utf16le");
}

let _base122DecodeSource: string | undefined;
function base122DecodeSource(): string {
  _base122DecodeSource ??= minifySync("base122.js", `(${base122Decode})`, {
    compress: false,
    mangle: true,
  }).code.replace(/;\s*$/, "");
  return _base122DecodeSource;
}

/**
 * Inverse of `base122Encode`. Self-contained: inlined into compressed chunks via `Function#toString()`.
 */
export function base122Decode(s: string): Uint8Array {
  const illegal = [0, 10, 13, 34, 92];
  const out = new Uint8Array(s.length * 2);
  let p = 0;
  let b = 0;
  let n = 0;
  const put = (v: number) => {
    b |= v << n;
    n += 7;
    if (n > 7) {
      out[p++] = b;
      b >>= 8;
      n -= 8;
    }
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) {
      put(c);
    } else if (c >> 7 < 6) {
      put(illegal[(c >> 7) - 1]);
      put(c & 127);
    } else {
      put(illegal[(c >> 7) - 6]);
    }
  }
  return out.subarray(0, p);
}

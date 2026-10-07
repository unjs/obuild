import { describe, test, expect, beforeAll } from "vitest";
import { gunzipSync } from "node:zlib";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import { build } from "../src/build.ts";
import {
  base122Decode,
  base122Encode,
  compressModule,
} from "../src/builders/plugins/compress-libs.ts";
import { libChunkName } from "../src/utils.ts";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

describe("obuild", () => {
  beforeAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  test("build fixture", async () => {
    await build({
      cwd: fixtureDir,
      entries: [
        { type: "bundle", input: ["src/index", "src/cli"] },
        { type: "transform", input: "src/runtime", outDir: "dist/runtime" },
        "src/utils.ts",
        "src/import-attributes.ts",
      ],
    });
  });

  test("dist files match expected", async () => {
    const distFiles = await readdir(distDir, { recursive: true }).then((r) => r.sort());
    expect(distFiles).toMatchInlineSnapshot(`
      [
        "THIRD-PARTY-LICENSES.md.gz",
        "_chunks",
        "_chunks/dynamic.mjs",
        "_chunks/dynamic2.mjs",
        "_chunks/libs",
        "_chunks/libs/defu.mjs",
        "cli.d.mts",
        "cli.mjs",
        "import-attributes.d.mts",
        "import-attributes.mjs",
        "index.d.mts",
        "index.mjs",
        "runtime",
        "runtime/broken.mjs",
        "runtime/index.d.mts",
        "runtime/index.mjs",
        "runtime/js-module.js",
        "runtime/test.d.mts",
        "runtime/test.mjs",
        "runtime/test.txt",
        "runtime/ts-module.d.mts",
        "runtime/ts-module.mjs",
        "utils.d.mts",
        "utils.mjs",
      ]
    `);
  });

  test("validate dist entries", async () => {
    const distIndex = await import(new URL("index.mjs", distDir).href);
    expect(distIndex.test).instanceOf(Function);

    const distRuntimeIndex = await import(new URL("index.mjs", distDir).href);
    expect(distRuntimeIndex.test).instanceOf(Function);

    const distUtils = await import(new URL("utils.mjs", distDir).href);
    expect(distUtils.test).instanceOf(Function);
  });

  test("runtime .dts files use .mjs extension", async () => {
    const runtimeIndexMts = await readFile(new URL("runtime/index.d.mts", distDir), "utf8");
    expect(runtimeIndexMts).contain("./test.mjs");
  });

  test("# imports are external", async () => {
    const indexContent = await readFile(new URL("index.mjs", distDir), "utf8");
    expect(indexContent).contain("#internal");
  });

  test("bytes and text import attributes", async () => {
    const dist = await import(new URL("import-attributes.mjs", distDir).href);
    // Every byte value survives the base64 round trip
    expect(dist.bytes).toBeInstanceOf(Uint8Array);
    expect([...dist.bytes]).toEqual([...Array.from({ length: 256 }).keys()]);
    expect(dist.text).toBe("Hello from text\n");
    // File type is ignored: `.json` as text, `.txt` as bytes
    expect(dist.jsonAsText).toBe('{ "json": true }\n');
    expect(dist.textAsBytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(dist.textAsBytes)).toBe("Hello from text\n");
    // Dynamic imports
    const dynamic = await dist.dynamic();
    expect(dynamic.text).toBe("Dynamically imported\n");
    expect(new TextDecoder().decode(dynamic.bytes)).toBe("Dynamically imported\n");
    // Contents are inlined
    const code = await readFile(new URL("import-attributes.mjs", distDir), "utf8");
    expect(code).not.toContain("files/");
    expect(code).toContain("Hello from text");
    // Declarations use the value types
    const dts = await readFile(new URL("import-attributes.d.mts", distDir), "utf8");
    expect(dts).toContain("declare const _default: Uint8Array;");
    expect(dts).toContain("declare const _default$1: string;");
  });

  test("cli shebang is executable", async () => {
    const cliPath = new URL("cli.mjs", distDir);
    const stats = await stat(cliPath);
    expect(stats.mode & 0o111).toBe(0o111); // Check if executable
  });

  test("license file matches snapshot", async () => {
    const gzipped = await readFile(new URL("THIRD-PARTY-LICENSES.md.gz", distDir));
    const content = gunzipSync(gzipped).toString("utf8");
    expect(content).toMatchSnapshot();
  });

  test("license: { gzip: false } emits plain file", async () => {
    const plainDistDir = new URL("dist-plain/", fixtureDir);
    await rm(plainDistDir, { recursive: true, force: true });
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/index"],
            outDir: "dist-plain",
            license: { gzip: false },
          },
        ],
      });
      const plainFiles = await readdir(plainDistDir);
      expect(plainFiles).toContain("THIRD-PARTY-LICENSES.md");
      expect(plainFiles).not.toContain("THIRD-PARTY-LICENSES.md.gz");
      const content = await readFile(new URL("THIRD-PARTY-LICENSES.md", plainDistDir), "utf8");
      expect(content).toContain("# Licenses of Bundled Dependencies");
    } finally {
      await rm(plainDistDir, { recursive: true, force: true });
    }
  });

  test("trace: [...] externalizes and traces only listed packages", async () => {
    const traceDistDir = new URL("dist-trace/", fixtureDir);
    await rm(traceDistDir, { recursive: true, force: true });
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/trace"],
            outDir: "dist-trace",
            trace: ["defu"],
            dts: false,
          },
        ],
      });
      const traceFiles = await readdir(traceDistDir, { recursive: true }).then((r) => r.sort());
      // `defu` is traced into node_modules, `pathe` is still bundled
      expect(traceFiles).toContain("node_modules/defu/package.json");
      expect(traceFiles).not.toContain("_chunks/libs/defu.mjs");
      expect(traceFiles).toContain("_chunks/libs/pathe.mjs");
      expect(traceFiles.some((f) => f.startsWith("node_modules/pathe"))).toBe(false);
      const content = await readFile(new URL("trace.mjs", traceDistDir), "utf8");
      expect(content).toMatch(/from\s*["']defu["']/);
      const dist = await import(new URL("trace.mjs", traceDistDir).href);
      expect(dist.traced()).toBe("a/b{}");
    } finally {
      await rm(traceDistDir, { recursive: true, force: true });
    }
  });

  test("minifyLibs: [...] minifies only listed lib chunks", async () => {
    const minDistDir = new URL("dist-minify-libs/", fixtureDir);
    await rm(minDistDir, { recursive: true, force: true });
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/trace"],
            outDir: "dist-minify-libs",
            minifyLibs: ["pathe"],
            dts: false,
          },
        ],
      });
      const read = (path: string) => readFile(new URL(path, minDistDir), "utf8");
      const lineCount = async (path: string) => (await read(path)).trim().split("\n").length;
      // `pathe` is minified, `defu` and the entry are left readable
      expect(await lineCount("_chunks/libs/pathe.mjs")).toBeLessThanOrEqual(2);
      expect(await lineCount("_chunks/libs/defu.mjs")).toBeGreaterThan(10);
      expect(await read("trace.mjs")).toContain("function traced()");
      const dist = await import(new URL("trace.mjs", minDistDir).href);
      expect(dist.traced()).toBe("a/b{}");
    } finally {
      await rm(minDistDir, { recursive: true, force: true });
    }
  });

  test("compressLibs: { algorithm: 'deflate' } works with and without Node.js builtins", async () => {
    const compressDistDir = new URL("dist-compress-libs/", fixtureDir);
    await rm(compressDistDir, { recursive: true, force: true });
    const server = createServer((_req, res) => res.end("hello"));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/compress"],
            outDir: "dist-compress-libs",
            minifyLibs: true,
            compressLibs: { include: ["undici"], algorithm: "deflate" },
            dts: false,
          },
        ],
      });
      const read = (path: string) => readFile(new URL(path, compressDistDir), "utf8");
      const undiciChunk = await read("_chunks/libs/undici.mjs");
      // Imports/exports are preserved, body is inlined as a compressed payload
      expect(undiciChunk).toMatch(
        /^import\s*\{\s*createRequire as \w+\s*\}\s*from\s*"node:module";/,
      );
      expect(undiciChunk).toMatch(/\nexport \{ \w+ as require_undici \};\n$/);
      expect(undiciChunk).toContain(`getBuiltinModule?.("node:zlib")`);
      expect(undiciChunk).not.toContain("module.exports");
      expect(undiciChunk.length).toBeLessThan(300_000);

      const url = `http://localhost:${(server.address() as AddressInfo).port}`;

      // Node.js (sync zlib)
      const dist = await import(new URL("compress.mjs", compressDistDir).href);
      expect(await dist.get(url)).toBe(`{"body":"hello","status":200}`);

      // Other runtimes (`DecompressionStream` + top-level await)
      const getBuiltinModule = process.getBuiltinModule;
      // @ts-expect-error
      process.getBuiltinModule = undefined;
      const lib = await import(
        new URL("_chunks/libs/undici.mjs?no-builtins", compressDistDir).href
      ).finally(() => {
        process.getBuiltinModule = getBuiltinModule;
      });
      const res = await lib.require_undici().request(url);
      expect(await res.body.text()).toBe("hello");
    } finally {
      server.close();
      await rm(compressDistDir, { recursive: true, force: true });
    }
  });

  test("compressLibs: [...] compresses only listed lib chunks with brotli (require(esm) compatible)", async () => {
    const compressDistDir = new URL("dist-compress-libs-brotli/", fixtureDir);
    await rm(compressDistDir, { recursive: true, force: true });
    const server = createServer((_req, res) => res.end("hello"));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/compress"],
            outDir: "dist-compress-libs-brotli",
            minifyLibs: true,
            compressLibs: ["undici"],
            dts: false,
          },
        ],
      });
      const undiciPath = new URL("_chunks/libs/undici.mjs", compressDistDir);
      const undiciChunk = await readFile(undiciPath, "utf8");
      expect(undiciChunk).toContain(
        `import { brotliDecompressSync as __obuild_decompress } from "node:zlib";`,
      );
      expect(undiciChunk).not.toContain("getBuiltinModule");
      expect(undiciChunk).not.toContain("await ");
      // `defu` is not listed
      expect(
        await readFile(new URL("_chunks/libs/defu.mjs", compressDistDir), "utf8"),
      ).not.toContain("__obuild_source");
      expect(Buffer.byteLength(undiciChunk)).toBeLessThan(170_000);

      const url = `http://localhost:${(server.address() as AddressInfo).port}`;
      const dist = await import(new URL("compress.mjs", compressDistDir).href);
      expect(await dist.get(url)).toBe(`{"body":"hello","status":200}`);
      // No top-level await -> loadable with require(esm)
      const lib = createRequire(import.meta.url)(undiciPath.pathname);
      expect(lib.require_undici().request).toBeTypeOf("function");
    } finally {
      server.close();
      await rm(compressDistDir, { recursive: true, force: true });
    }
  });

  test("libChunkName: one chunk per package (POSIX and Windows paths)", () => {
    expect(libChunkName("/proj/node_modules/pkg/index.js")).toBe("libs/pkg");
    expect(libChunkName("/proj/node_modules/@scope/pkg/index.js")).toBe("libs/@scope/pkg");
    expect(libChunkName("/proj/node_modules/a/node_modules/b/index.js")).toBe("libs/b");
    expect(libChunkName("/proj/node_modules/pkg/index.d.mts")).toBe("libs/pkg.d");
    expect(libChunkName(String.raw`C:\proj\node_modules\pkg\index.js`)).toBe("libs/pkg");
    expect(libChunkName(String.raw`C:\proj\node_modules\@scope\pkg\index.js`)).toBe(
      "libs/@scope/pkg",
    );
    expect(libChunkName(String.raw`C:\proj\node_modules\@scope\pkg\index.d.ts`)).toBe(
      "libs/@scope/pkg.d",
    );
    expect(libChunkName("\0virtual:node_modules")).toBe("libs/common");
  });

  test("base122 encoding round-trips", () => {
    for (let len = 0; len < 600; len++) {
      // Random bytes, and runs of values that are illegal in string literals (incl. as the last group)
      for (const data of [randomBytes(len), Buffer.alloc(len, 0x22), Buffer.alloc(len, 0)]) {
        const encoded = base122Encode(data);
        expect(encoded).not.toMatch(/["\\\n\r\0]/);
        expect(Buffer.from(base122Decode(encoded)).equals(data)).toBe(true);
      }
    }
  });

  test.each(["deflate", "brotli"] as const)(
    "compressModule: preserves module semantics (%s)",
    async (algorithm) => {
      const tmpDir = new URL(`dist-compress-module-${algorithm}/`, fixtureDir);
      await rm(tmpDir, { recursive: true, force: true });
      await mkdir(tmpDir, { recursive: true });
      try {
        await writeFile(new URL("dep.mjs", tmpDir), `export let count = 1;\n`);
        const code = compressModule(
          "mod.mjs",
          /* js */ `
import { basename } from "node:path";
import { count } from "./dep.mjs";
export * from "./dep.mjs";
export { sep } from "node:path";
export const name = basename(import.meta.url);
export function loadOs() { return import("node:os").then((m) => typeof m.platform); }
const getCount = () => count;
export { getCount, basename as base, name as "kebab-name" };
`,
          { algorithm },
        );
        expect(code).not.toContain("loadOs() {");
        await writeFile(new URL("mod.mjs", tmpDir), code);
        const mod = await import(new URL("mod.mjs", tmpDir).href);
        expect(Object.keys(mod).sort()).toEqual(
          ["base", "count", "getCount", "kebab-name", "loadOs", "name", "sep"].sort(),
        );
        expect(mod.name).toBe("mod.mjs");
        expect(mod["kebab-name"]).toBe("mod.mjs");
        expect(mod.getCount()).toBe(1);
        expect(mod.base("/a/b.txt")).toBe("b.txt");
        expect(await mod.loadOs()).toBe("function");

        // Unsupported syntax is rejected (plugin keeps such chunks as-is)
        expect(() => compressModule("tla.mjs", "export const a = await 1;")).toThrow();
        expect(() => compressModule("default.mjs", "export default function () {}")).toThrow(
          /export default/,
        );
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    },
  );

  test("isolatedDeclarations fallback: .mjs emitted, .d.mts skipped, runtime loads", async () => {
    const runtimeDistFiles = await readdir(new URL("runtime/", distDir));
    expect(runtimeDistFiles).toContain("broken.mjs");
    expect(runtimeDistFiles).not.toContain("broken.d.mts");

    const runtimeIndex = await import(new URL("runtime/index.mjs", distDir).href);
    const broken = await runtimeIndex.loadBroken();
    expect(broken.Flags).toMatchObject({ None: 0 });
  });
});

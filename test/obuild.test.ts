import { describe, test, expect, beforeAll } from "vitest";
import { gunzipSync } from "node:zlib";

import { build } from "../src/build.ts";
import { readdir, readFile, rm, stat } from "node:fs/promises";

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
        "THIRD-PARTY-LICENSES.md",
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
    const content = await readFile(new URL("THIRD-PARTY-LICENSES.md", distDir), "utf8");
    expect(content).toMatchSnapshot();
  });

  test("license: { gzip: true } emits gzipped file", async () => {
    const gzDistDir = new URL("dist-gz/", fixtureDir);
    await rm(gzDistDir, { recursive: true, force: true });
    try {
      await build({
        cwd: fixtureDir,
        entries: [
          {
            type: "bundle",
            input: ["src/index"],
            outDir: "dist-gz",
            license: { gzip: true },
          },
        ],
      });
      const gzFiles = await readdir(gzDistDir);
      expect(gzFiles).toContain("THIRD-PARTY-LICENSES.md.gz");
      expect(gzFiles).not.toContain("THIRD-PARTY-LICENSES.md");
      const gzipped = await readFile(new URL("THIRD-PARTY-LICENSES.md.gz", gzDistDir));
      const decompressed = gunzipSync(gzipped).toString("utf8");
      expect(decompressed).toContain("# Licenses of Bundled Dependencies");
    } finally {
      await rm(gzDistDir, { recursive: true, force: true });
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

  test("isolatedDeclarations fallback: .mjs emitted, .d.mts skipped, runtime loads", async () => {
    const runtimeDistFiles = await readdir(new URL("runtime/", distDir));
    expect(runtimeDistFiles).toContain("broken.mjs");
    expect(runtimeDistFiles).not.toContain("broken.d.mts");

    const runtimeIndex = await import(new URL("runtime/index.mjs", distDir).href);
    const broken = await runtimeIndex.loadBroken();
    expect(broken.Flags).toMatchObject({ None: 0 });
  });
});

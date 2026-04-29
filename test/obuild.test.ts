import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../src/build.ts";
import { readdir, readFile, rm, stat } from "node:fs/promises";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

const isolatedDeclFixtureDir = new URL("fixture-isolated-decl/", import.meta.url);
const isolatedDeclDistDir = new URL("dist/", isolatedDeclFixtureDir);

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
      ],
    });
  });

  test("dist files match expected", async () => {
    const distFiles = await readdir(distDir, { recursive: true }).then((r) => r.sort());
    expect(distFiles).toMatchInlineSnapshot(`
      [
        "cli.d.mts",
        "cli.mjs",
        "index.d.mts",
        "index.mjs",
        "runtime",
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

  test("cli shebang is executable", async () => {
    const cliPath = new URL("cli.mjs", distDir);
    const stats = await stat(cliPath);
    expect(stats.mode & 0o111).toBe(0o111); // Check if executable
  });
});

describe("transform: isolated-declarations fallback", () => {
  beforeAll(async () => {
    await rm(isolatedDeclDistDir, { recursive: true, force: true });
  });

  test("emits .mjs even when declaration emit fails on isolatedDeclarations", async () => {
    await build({
      cwd: isolatedDeclFixtureDir,
      entries: [{ type: "transform", input: "src", outDir: "dist" }],
    });

    const distFiles = await readdir(isolatedDeclDistDir, { recursive: true }).then((r) => r.sort());
    expect(distFiles).toContain("broken.mjs");
    expect(distFiles).toContain("ok.mjs");
    expect(distFiles).toContain("index.mjs");
    // The failing file does not get a declaration; sibling files still do.
    expect(distFiles).not.toContain("broken.d.mts");
    expect(distFiles).toContain("ok.d.mts");
    expect(distFiles).toContain("index.d.mts");
  });

  test("dist is loadable at runtime (no ERR_MODULE_NOT_FOUND)", async () => {
    const mod = await import(new URL("index.mjs", isolatedDeclDistDir).href);
    expect(mod.ok).instanceOf(Function);
    expect(mod.Flags).toMatchObject({ None: 0 });
  });
});

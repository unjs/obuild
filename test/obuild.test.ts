import { describe, test, expect, beforeAll } from "vitest";

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
      ],
    });
  });

  test("dist files match expected", async () => {
    const distFiles = await readdir(distDir, { recursive: true }).then((r) =>
      r.sort(),
    );
    expect(distFiles).toMatchInlineSnapshot(`
      [
        "cli.d.mts",
        "cli.mjs",
        "index.d.mts",
        "index.mjs",
        "runtime",
        "runtime/index.d.mts",
        "runtime/index.mjs",
        "runtime/test.d.mts",
        "runtime/test.mjs",
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
    const runtimeIndexMts = await readFile(
      new URL("runtime/index.d.mts", distDir),
      "utf8",
    );
    expect(runtimeIndexMts).contain("./test.mjs");
  });

  test("cli shebang is executable", async () => {
    const cliPath = new URL("cli.mjs", distDir);
    const stats = await stat(cliPath);
    expect(stats.mode & 0o111).toBe(0o111); // Check if executable
  });
});

import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../src/build.ts";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import {resolve}  from "pathe";

const fixtureDir = resolve(__dirname, "fixture/");
const distDir = resolve(fixtureDir, "dist/");

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
        r.sort().map((p) => p.replace(/\\/g, "/")),
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
        "runtime/js-module.js",
        "runtime/test.d.mts",
        "runtime/test.mjs",
        "runtime/ts-module.d.mts",
        "runtime/ts-module.mjs",
        "utils.d.mts",
        "utils.mjs",
      ]
    `);
  });

  test("validate dist entries", async () => {
    const distIndex = await import(resolve(distDir, "index.mjs"));
    expect(distIndex.test).instanceOf(Function);

    const distRuntimeIndex = await import(resolve(distDir, "index.mjs"));
    expect(distRuntimeIndex.test).instanceOf(Function);

    const distUtils = await import(resolve(distDir, "utils.mjs"));
    expect(distUtils.test).instanceOf(Function);
  });

  test("runtime .dts files use .mjs extension", async () => {
    const runtimeIndexMts = await readFile(
      resolve(distDir, "runtime/index.d.mts"),
      "utf8",
    );
    expect(runtimeIndexMts).contain("./test.mjs");
  });

  test("cli shebang is executable", async () => {
    const cliPath = resolve(distDir, "cli.mjs");
    const stats = await stat(cliPath);
    expect(stats.mode & 0o111).toBe(0o111); // Check if executable
  });
});

import { describe, test, expect, beforeAll } from "vitest";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
        "src/utils.ts",
        {
          type: "transform",
          input: "src/runtime",
          outDir: "dist/runtime",
        },
        {
          type: "transform",
          input: "src/min",
          outDir: "dist/min",
          oxc: {
            minify: {
              sourcemap: true,
            },
          },
        },
      ],
    });
  });

  test("dist files match expected", async () => {
    const distFiles = await readdir(distDir, {
      recursive: true,
      withFileTypes: true,
    }).then((entries) =>
      entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          relative(fileURLToPath(distDir), join(entry.parentPath, entry.name)),
        )
        .sort(),
    );

    expect(distFiles).toMatchInlineSnapshot(`
      [
        "cli.d.mts",
        "cli.mjs",
        "index.d.mts",
        "index.mjs",
        "min/components/jsx.d.mts",
        "min/components/jsx.mjs",
        "min/components/jsx.mjs.map",
        "min/components/jsx.src.mjs",
        "min/components/tsx.d.mts",
        "min/components/tsx.mjs",
        "min/components/tsx.mjs.map",
        "min/components/tsx.src.mjs",
        "min/modules/js-module.js",
        "min/modules/js-module.js.map",
        "min/modules/js-module.src.js",
        "min/modules/mjs-module.mjs",
        "min/modules/mjs-module.mjs.map",
        "min/modules/mjs-module.src.mjs",
        "min/modules/ts-module.d.mts",
        "min/modules/ts-module.mjs",
        "min/modules/ts-module.mjs.map",
        "min/modules/ts-module.src.mjs",
        "runtime/components/jsx.d.mts",
        "runtime/components/jsx.mjs",
        "runtime/components/tsx.d.mts",
        "runtime/components/tsx.mjs",
        "runtime/components/vue.vue",
        "runtime/components/vue.vue.d.ts",
        "runtime/index.d.mts",
        "runtime/index.mjs",
        "runtime/modules/js-module.js",
        "runtime/modules/mjs-module.mjs",
        "runtime/modules/ts-module.d.mts",
        "runtime/modules/ts-module.mjs",
        "runtime/test.d.mts",
        "runtime/test.mjs",
        "utils.d.mts",
        "utils.mjs",
      ]
    `);

    const output = await Promise.all(
      distFiles.map(async (file) => {
        return [file, await readFile(new URL(file, distDir), "utf8")];
      }),
    );

    await expect(output).toMatchFileSnapshot("./snapshots/output.snap");
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

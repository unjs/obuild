import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../../../src/build.ts";
import { rm } from "node:fs/promises";
import { readDistFiles, readFileNames } from "../../utils.ts";
import type { TransformEntry } from "../../../src/types.ts";
import { getTsconfig } from "get-tsconfig";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

const tsConfig = getTsconfig(new URL("tsconfig.json", fixtureDir).pathname);
const dts: TransformEntry["dts"] = {
  typescript: tsConfig?.config,
  relativeExtensions: true,
  tsgo: true,
};

describe("transform with relativeExtensions", () => {
  beforeAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  test("build fixture", async () => {
    await build({
      cwd: fixtureDir,
      entries: [
        {
          type: "transform",
          input: "src/",
          outDir: "dist/",
          dts,
        },
      ],
    });
  }, 20_000);

  test("dist files match expected", async () => {
    const distFiles = await readFileNames(distDir);

    expect(distFiles).toMatchInlineSnapshot(`
      [
        "assets/demo.css",
        "assets/nested.css",
        "index.d.mts",
        "index.mjs",
        "modules/dynamic.d.mts",
        "modules/dynamic.mjs",
        "modules/index.d.mts",
        "modules/index.mjs",
        "modules/js-module.js",
        "modules/mjs-module.mjs",
        "modules/ts-module.d.mts",
        "modules/ts-module.mjs",
        "test.d.mts",
        "test.mjs",
      ]
    `);

    // @todo - Dynamic import has no declaration, it works with `tsc`
    await expect(await readDistFiles(distDir)).toMatchFileSnapshot(
      "./fixture/dist.snap",
    );
  });
});

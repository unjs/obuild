import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../../../src/build.ts";
import { rm } from "node:fs/promises";
import { readDistFiles, readFileNames } from "../../utils.ts";
import { getTsconfig } from "get-tsconfig";
import type { TransformEntry } from "../../../src/types.ts";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

const tsConfig = getTsconfig(new URL("tsconfig.json", fixtureDir).pathname);
const dts: TransformEntry["dts"] = {
  typescript: tsConfig?.config,
};

describe("transform minified map", () => {
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
          oxc: {
            minify: {
              sourcemap: true,
            },
          },
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
        "index.mjs.map",
        "modules/js-module.js",
        "modules/js-module.js.map",
        "modules/mjs-module.mjs",
        "modules/mjs-module.mjs.map",
        "modules/ts-module.d.mts",
        "modules/ts-module.mjs",
        "modules/ts-module.mjs.map",
        "test.d.mts",
        "test.mjs",
        "test.mjs.map",
      ]
    `);

    await expect(await readDistFiles(distDir)).toMatchFileSnapshot(
      "./fixture/dist.snap",
    );
  });
});

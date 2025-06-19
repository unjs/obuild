import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../../../../src/build.ts";
import { rm } from "node:fs/promises";
import { readDistFiles, readFileNames } from "../../../utils.ts";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

describe("source-map", () => {
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
            transform: {
              sourcemap: true,
            },
          },
        },
      ],
    });
  }, 20_000);

  test("dist files match expected", async () => {
    const distFiles = await readFileNames(distDir);

    expect(distFiles).toMatchInlineSnapshot(`
      [
        "index.d.mts",
        "index.mjs",
        "index.mjs.map",
        "modules/js-module.d.ts",
        "modules/js-module.js",
        "modules/mjs-module.d.mts",
        "modules/mjs-module.mjs",
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

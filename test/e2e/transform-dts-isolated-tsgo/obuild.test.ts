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
  tsgo: true,
};

describe("transform dts only", () => {
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
          transformers: [
            async (input) => {
              if (input.extension !== ".ts") {
                return undefined;
              }

              return [
                {
                  path: input.path,
                  extension: ".d.ts",
                  srcPath: input.srcPath,
                  contents: await input.getContents(),
                  declaration: true,
                },
              ];
            },
          ],
        },
      ],
    });
  }, 20_000);

  test("dist files match expected", async () => {
    const distFiles = await readFileNames(distDir);

    expect(distFiles).toMatchInlineSnapshot(`
      [
        "a-types.d.ts",
        "b-types.d.ts",
        "c-types.d.ts",
        "dir/index.d.ts",
        "module.d.ts",
      ]
    `);

    await expect(await readDistFiles(distDir)).toMatchFileSnapshot(
      "./fixture/dist.snap",
    );
  });
});

import { describe, test, expect, beforeAll } from "vitest";

import { build } from "../../../src/build.ts";
import { rm } from "node:fs/promises";
import { readDistFiles, readFileNames } from "../../utils.ts";
import type { TransformEntry } from "../../../src/types.ts";

const fixtureDir = new URL("fixture/", import.meta.url);
const distDir = new URL("dist/", fixtureDir);

const dts: TransformEntry["dts"] = {
  tsgo: true,
};

describe("transform components", () => {
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
        "components/blank.vue",
        "components/blank.vue.d.ts",
        "components/define-model.vue",
        "components/define-model.vue.d.ts",
        "components/emit-and-with-default.vue",
        "components/emit-and-with-default.vue.d.ts",
        "components/index.d.mts",
        "components/index.mjs",
        "components/js.vue",
        "components/js.vue.d.ts",
        "components/jsx.d.mts",
        "components/jsx.mjs",
        "components/script-multi-block.vue",
        "components/script-multi-block.vue.d.ts",
        "components/script-setup-ts.vue",
        "components/script-setup-ts.vue.d.ts",
        "components/ts.vue",
        "components/ts.vue.d.ts",
        "components/tsx.d.mts",
        "components/tsx.mjs",
        "components/vue-component.d.mts",
        "components/vue-component.mjs",
        "prop-types/index.d.mts",
        "prop-types/index.mjs",
      ]
    `);

    await expect(await readDistFiles(distDir)).toMatchFileSnapshot(
      "./fixture/dist.snap",
    );
  });
});

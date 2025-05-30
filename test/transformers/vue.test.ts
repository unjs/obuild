import { describe, test, expect } from "vitest";

import {
  vueTransformer,
  VueTransformerOptions,
} from "../../src/transformers/vue.ts";
import { InputFile } from "../../src/transformers/types.ts";

describe("Vue transformer", () => {
  const vueTransform = async (
    contents: string,
    options: VueTransformerOptions["vue"],
  ) => {
    const transforms: InputFile[] = [];
    const outputFiles = await vueTransformer(
      {
        path: "test.vue",
        extension: ".vue",
        getContents() {
          return contents;
        },
      },
      {
        transformFile: (inputFile) => {
          transforms.push(inputFile);

          return [];
        },
        options: {
          vue: options,
        },
      },
    );

    return { transforms, outputFiles };
  };

  test("Transforms script", async () => {
    const { outputFiles } = await vueTransform(
      `<script lang="ts">const a: number = 1</script>`,
      { dts: false },
    );

    expect(outputFiles).toHaveLength(1);
    expect(outputFiles![0].contents).toMatchInlineSnapshot(`
      "<script>
      const a = 1;
      </script>
      "
    `);
  });

  test("Generates declaration", async () => {
    const { outputFiles, transforms } = await vueTransform(
      `<script lang="ts">const a: number = 1</script>`,
      { dts: true },
    );

    expect(transforms).toHaveLength(1);
    expect(transforms.filter((i) => i.extension === ".js").length).toBe(1);

    expect(outputFiles).toHaveLength(2);
    expect(
      outputFiles?.filter((o) => o.declaration === "generate").length,
    ).toBe(1);
  });

  test("Does not generate declaration", async () => {
    const { outputFiles } = await vueTransform(
      `<script lang="ts">const a: number = 1</script>`,
      { dts: false },
    );

    expect(outputFiles?.length).toBe(1);
  });
});

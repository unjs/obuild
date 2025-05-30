import consola from "consola";
import { mkdistLoader, type MkdistLoader } from "./mkdist.ts";

import type { InputFile, Transformer, TransformerContext } from "./types.ts";

export interface VueTransformerOptions {
  vue?: {
    /**
     * Declaration generation.
     *
     * Set to `false` to disable.
     */
    dts?: boolean;
  };
}

let cachedVueLoader: MkdistLoader | undefined;

export const vueTransformer: Transformer = async (
  inputFile: InputFile,
  context: TransformerContext,
) => {
  if (!cachedVueLoader) {
    cachedVueLoader = await import("vue-sfc-transformer/mkdist").then(
      (r) => r.vueLoader,
      (error) => {
        consola.error(
          `Failed to transform "${inputFile.path}" because vue-sfc-transformer is not installed.`,
        );

        throw error;
      },
    );
  }

  const vueTransformer = mkdistLoader(cachedVueLoader, {
    declaration: context.options.vue?.dts,
  });

  return vueTransformer(inputFile, context);
};

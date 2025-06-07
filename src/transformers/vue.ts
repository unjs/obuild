import consola from "consola";
import { mkdistLoader, type MkdistLoader } from "./mkdist.ts";

import type { InputFile, Transformer, TransformerContext } from "./types.ts";

export interface VueTransformerOptions {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  vue?: {};
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
    declaration: context.options.dts,
  });

  return vueTransformer(inputFile, context);
};

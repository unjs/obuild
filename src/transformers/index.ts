import { consola } from "consola";
import { oxcTransformer } from "./oxc.ts";
import { vueTransformer } from "./vue.ts";

import type {
  Transformer,
  InputFile,
  OutputFile,
  TransformerContext,
  TransformerName,
  TransformFile,
  CreateTransformerOptions,
} from "./types.ts";
import { postcssTransformer } from "./postcss.ts";
import { sassTransformer } from "./sass.ts";

export type * from "./types.ts";
export { mkdistLoader, type MkdistLoaderOptions } from "./mkdist.ts";

const transformers: Record<TransformerName, Transformer> = {
  oxc: oxcTransformer,
  vue: vueTransformer,
  sass: sassTransformer,
  postcss: postcssTransformer,
};

export const defaultTransformers: TransformerName[] = [
  "oxc",
  "vue",
  "sass",
  "postcss",
];

function resolveTransformer(
  transformer: TransformerName | Transformer,
): Transformer | undefined {
  if (typeof transformer === "string") {
    return transformers[transformer];
  }
  return transformer;
}

function resolveTransformers(
  transformers: Array<TransformerName | Transformer>,
): Transformer[] {
  return transformers
    .map((transformerOrName) => {
      const transformer = resolveTransformer(transformerOrName);
      if (!transformer) {
        consola.warn("Unknown transformer:", transformerOrName);
      }
      return transformer;
    })
    .filter((transformer) => transformer !== undefined);
}

/*
 * Creates a transformer function that can process input files using specified transformers.
 *
 * @param options - Configuration options for the transformer.
 * @returns An object with a `transformFile` method to transform files.
 */
export function createTransformer(options: CreateTransformerOptions): {
  transformFile: TransformFile;
} {
  const {
    transformers = defaultTransformers,
    tsConfig,
    ...transformerOptions
  } = options;

  const resolvedTransformers = resolveTransformers(transformers);

  const transformFile = async function (
    input: InputFile,
  ): Promise<OutputFile[]> {
    const context: TransformerContext = {
      transformFile,
      tsConfig,
      options: transformerOptions,
    };

    for (const transformer of resolvedTransformers) {
      const outputs = await transformer(input, context);

      if (outputs?.length) {
        return outputs;
      }
    }

    return [
      {
        path: input.path,
        srcPath: input.srcPath,
        raw: true,
      },
    ];
  };

  return {
    transformFile,
  };
}

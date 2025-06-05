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
export { mkdistLoader } from "./mkdist.ts";

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

/**
 *
 * @param transformers - List of transformers to use. Can be a list of transformer names (e.g. "oxc", "vue") or transformer functions.
 * @param options - Options to pass to the transformers, such as `resolve` options for module resolution.
 * @returns An object with a `transformFile` method to transform files.
 */
export function createTransformer(options: CreateTransformerOptions): {
  transformFile: TransformFile;
} {
  const resolvedTransformers = resolveTransformers(
    options.transformers || defaultTransformers,
  );

  const transformFile = async function (
    input: InputFile,
  ): Promise<OutputFile[]> {
    const context: TransformerContext = {
      transformFile,
      options,
      tsConfig: options.tsConfig,
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

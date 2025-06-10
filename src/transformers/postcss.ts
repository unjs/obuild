// Ported from https://github.com/unjs/mkdist/blob/main/src/loaders/postcss.ts

import cssnano from "cssnano";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import postcssNested from "postcss-nested";

import type { Options as PostcssNestedOptions } from "postcss-nested";
import type { Options as AutoprefixerOptions } from "autoprefixer";
import type { Options as CssnanoOptions } from "cssnano";
import type {
  AcceptedPlugin as PostcssPlugin,
  ProcessOptions as PostcssProcessOptions,
} from "postcss";

import type {
  InputFile,
  TransformerContext,
  Transformer,
  TransformResult,
} from "./types.ts";

/**
 * PostCSS transformer options.
 */
export interface PostcssTransformerOptions {
  postcss?:
    | false
    | {
        nested?: false | PostcssNestedOptions;
        autoprefixer?: false | AutoprefixerOptions;
        cssnano?: false | CssnanoOptions;
        plugins?: PostcssPlugin[];
        processOptions?: Omit<PostcssProcessOptions, "from">;
      };
}

export const postcssTransformer: Transformer = async (
  input: InputFile,
  ctx: TransformerContext,
) => {
  const options = ctx.options;

  if (options.postcss === false || input.extension !== ".css") {
    return;
  }

  const output: TransformResult = [];
  const plugins: PostcssPlugin[] = [];
  const contents = await input.getContents();

  if (options.postcss?.nested !== false) {
    plugins.push(postcssNested(options.postcss?.nested));
  }

  if (options.postcss?.autoprefixer !== false) {
    plugins.push(autoprefixer(options.postcss?.autoprefixer));
  }

  if (options.postcss?.cssnano !== false) {
    plugins.push(cssnano(options.postcss?.cssnano));
  }

  if (Array.isArray(options.postcss?.plugins)) {
    plugins.push(...options.postcss.plugins);
  }

  const transformed = await postcss(plugins).process(contents, {
    ...options.postcss?.processOptions,
    from: input.srcPath,
  });

  output.push({
    contents: transformed.content,
    path: input.path,
    extension: ".css",
    type: "asset",
  });

  return output;
};

import { resolveProcessOptions } from "./oxc/config.ts";
import { transform } from "./oxc/transform.ts";
import { minify } from "./oxc/minify.ts";
import { mergeSourceMapFiles } from "./oxc/utils.ts";

import type { OutputFile, Transformer, TransformResult } from "./types.ts";
import type { ProcessOptions, ProcessableFile } from "./oxc/types.ts";
import type { ResolveOptions as ExsolveOptions } from "exsolve";
import type { TransformOptions as OxcTransformOptions } from "oxc-transform";
import type { MinifyOptions as OxcMinifyOptions } from "oxc-minify";

export interface OxcTransformerOptions {
  oxc?: {
    /**
     * Options for module resolution.
     *
     * See [exsolve](https://github.com/unjs/exsolve) for more details.
     */
    resolve?: Omit<ExsolveOptions, "from">;

    /**
     * Options passed to oxc-transform.
     *
     * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
     */
    transform?: OxcTransformOptions;

    /**
     * Minify the output using oxc-minify.
     *
     * Defaults to `false` if not provided.
     */
    minify?: OxcMinifyOptions | boolean;
  };
}

export const oxcTransformer: Transformer = async (
  input,
  context,
): Promise<TransformResult> => {
  const options = resolveProcessOptions(input, context);

  if (options === undefined) {
    return;
  }

  const outputFiles = await processFile(
    {
      path: input.path,
      srcPath: input.srcPath,
      extension: options.sourceConfig.extension || input.extension,
      contents: await input.getContents(),
      type: "code",
    },
    options,
  );

  return outputFiles.filter((file) => file !== undefined);
};

/**
 * Transforms and minifies a file based on the provided options.
 *
 * @param file - The file to process.
 * @param options - The options for processing the file.
 * @returns An array of output files, which may include `undefined`.
 */
async function processFile(
  file: Readonly<ProcessableFile>,
  options: ProcessOptions,
): Promise<Array<OutputFile | undefined>> {
  if (!options.sourceConfig.transform) {
    if (!options.minify) {
      return [{ ...file, raw: true }];
    }

    return minify(file, options.minify);
  }

  const [transformedFile, declarationFile, transformedSourceMapFile] =
    await transform(file, options);

  if (!options.minify) {
    return [transformedFile, declarationFile, transformedSourceMapFile];
  }

  const [minifiedFile, minifiedSourceMapFile] = await minify(
    transformedFile,
    options.minify,
  );

  const mergedSourceMapFile = mergeSourceMapFiles(
    transformedSourceMapFile,
    minifiedSourceMapFile,
  );

  return [minifiedFile, declarationFile, mergedSourceMapFile];
}

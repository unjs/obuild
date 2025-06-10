import { replaceExtension } from "./utils.ts";
import { minify as oxcMinify } from "oxc-minify";

import type {
  MinifiedFile,
  ProcessableFile,
  MinifiedSourceMapFile,
  ProcessOptions,
} from "./types.ts";

/**
 * Minifies the given input file using oxc-minify.
 *
 * @param input - The input file to minify.
 * @param options - Optional minification options.
 * @returns An array containing the minified file and optionally a source map file.
 */
export async function minify(
  input: Readonly<ProcessableFile>,
  options?: ProcessOptions["minify"],
): Promise<[MinifiedFile] | [MinifiedFile, MinifiedSourceMapFile]> {
  const { code: minifedCode, map: sourceMap } = oxcMinify(
    input.path,
    input.contents,
    options,
  );

  const minifiedFile: MinifiedFile = {
    ...input,
    type: "minified",
    contents: minifedCode,
  };

  if (!sourceMap) {
    return [minifiedFile];
  }

  const sourceMapFile: MinifiedSourceMapFile = {
    srcPath: input.srcPath,
    path: input.path,
    extension: `${input.extension}.map`,
    type: "source-map",
    origin: "minified",
    map: {
      ...sourceMap,
      file: replaceExtension(input.path),
      version: String(sourceMap.version),
    },
  };

  return [minifiedFile, sourceMapFile];
}

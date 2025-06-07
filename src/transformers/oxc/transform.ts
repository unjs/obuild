import { writeFile } from "node:fs/promises";
import { replaceExtension, rewriteSpecifiers } from "./utils.ts";
import { transform as oxcTransform } from "oxc-transform";

import type {
  DeclarationFile,
  ProcessableFile,
  ProcessOptions,
  TransformedSourceMapFile,
} from "./types.ts";

const M_LETTER_RE = /(?<=\.)(m)(?=[jt]s$)/;

/**
 * Transforms the given input file using oxc-transform.
 *
 * @param input - The input file to transform.
 * @param options - Optional transformation options.
 * @returns An array containing the transformed file, and optionally a declaration file and a source map file.
 */
export async function transform(
  input: Readonly<ProcessableFile>,
  options?: Pick<ProcessOptions, "transform" | "resolve" | "parser">,
): Promise<
  | [ProcessableFile, DeclarationFile]
  | [ProcessableFile, DeclarationFile, TransformedSourceMapFile]
> {
  const { contents } = rewriteSpecifiers(input, options);
  const {
    code: transformedCode,
    declaration: declarationContents,
    map: sourceMap,
    errors: transformErrors,
  } = oxcTransform(input.path, contents, options?.transform);

  const errors = transformErrors.filter(
    (err) => !err.message.includes("--isolatedDeclarations"),
  );

  if (errors.length > 0) {
    await writeFile(
      "build-dump.ts",
      `/** Error dump for ${input.srcPath} */\n\n` + input.contents,
      "utf8",
    );
    throw new Error(
      `Errors while transforming ${input.srcPath}: (hint: check build-dump.ts)`,
      {
        cause: errors,
      },
    );
  }

  const transformedFile = {
    ...input,
    contents: transformedCode,
  };

  const m = input.extension?.match(M_LETTER_RE)?.[0] || "";

  const declarationFile: DeclarationFile = {
    // Enable post-transform generation if `oxc-transform` didn't provide a declaration
    declaration: declarationContents === undefined,
    // Use the original contents if no declaration was generated
    contents: declarationContents || contents,
    path: input.path,
    srcPath: input.srcPath,
    extension: `.d.${m}ts`,
    type: "declaration",
  };

  if (!sourceMap) {
    return [transformedFile, declarationFile];
  }

  const sourceMapFile: TransformedSourceMapFile = {
    srcPath: input.srcPath,
    path: input.path,
    extension: `${input.extension}.map`,
    type: "source-map",
    origin: "transformed",
    map: {
      ...sourceMap,
      file: replaceExtension(input.path, input.extension),
      version: String(sourceMap.version),
    },
  };

  return [transformedFile, declarationFile, sourceMapFile];
}

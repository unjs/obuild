// Ported from https://github.com/unjs/mkdist/blob/main/src/loaders/sass.ts

import { pathToFileURL } from "node:url";
import { basename } from "pathe";
import type { InputFile, Transformer, TransformResult } from "./types.ts";

export const sassTransformer: Transformer = async (input: InputFile) => {
  if (
    ![".sass", ".scss"].includes(input.extension) ||
    input.srcPath === undefined
  ) {
    return;
  }

  // sass files starting with "_" are always considered partials
  // and should not be compiled to standalone CSS
  if (basename(input.srcPath).startsWith("_")) {
    return [
      {
        path: input.path,
        skip: true,
        type: "asset",
      },
    ];
  }

  const compileString = await import("sass").then(
    (r) => r.compileString || r.default.compileString,
  );

  const output: TransformResult = [];

  const contents = await input.getContents();

  output.push({
    contents: compileString(contents, {
      loadPaths: ["node_modules"],
      url: pathToFileURL(input.srcPath),
    }).css,
    path: input.path,
    extension: ".css",
    type: "asset",
  });

  return output;
};

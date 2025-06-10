import { dirname } from "pathe";

import type { InputFile, TransformerContext } from "../types.ts";
import type { ProcessSourceConfig, ProcessOptions } from "./types.ts";
import type { ResolveOptions as ExsolveOptions } from "exsolve";
import type { TransformOptions as OxcTransformOptions } from "oxc-transform";
import type { ParserOptions as OxcParserOptions } from "oxc-parser";
import type { MinifyOptions as OxcMinifyOptions } from "oxc-minify";

const DECLARATION_RE: RegExp = /\.d\.[cm]?ts$/;

/**
 * Configuration for processing source files based on their extensions.
 * Maps file extensions to their processing configurations, including transformation type and target extension.
 *
 * If a file extension is not listed, it will not be processed by the transformer/minifier.
 */
const sourceConfig: Record<string, ProcessSourceConfig | undefined> = {
  ".ts": {
    transform: "ts",
    extension: ".mjs",
  },
  ".mts": {
    transform: "ts",
    extension: ".mjs",
  },
  ".tsx": {
    transform: "tsx",
    extension: ".mjs",
  },
  ".jsx": {
    transform: "jsx",
    extension: ".mjs",
  },
  ".js": {
    transform: "js",
  },
  ".mjs": {
    transform: "js",
  },
};

/**
 * Returns the target extension for a given source extension.
 *
 * @param sourceExtension - The source file extension to get the target extension for.
 * @returns The target file extension for the given source extension, or undefined if not found.
 */
export function getTargetExtension(
  sourceExtension: string,
): string | undefined {
  return sourceConfig[sourceExtension]?.extension;
}

/**
 * Resolves the process options for a given input file based on its extension and the provided context.
 *
 * @param input - The input file to process.
 * @param context - Transformer context
 * @returns ProcessOptions or undefined if the input file should not be processed.
 */
export function resolveProcessOptions(
  input: InputFile,
  context: TransformerContext,
): ProcessOptions | undefined {
  const processSourceConfig = sourceConfig[input.extension];

  if (processSourceConfig === undefined || DECLARATION_RE.test(input.path)) {
    return;
  }

  const { oxc: options, dts } = context.options;

  const resolve: ExsolveOptions = {
    ...options?.resolve,
    extensions: options?.resolve?.extensions ?? [
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".mjs",
      ".cjs",
      ".json",
    ],
    suffixes: options?.resolve?.suffixes ?? ["", "/index"],
  };

  const parser: OxcParserOptions = {
    lang: processSourceConfig.transform,
    sourceType: "module",
  };

  // Enable source map for both transform and minify if it's enabled in any of them
  const sourceMapEnabled: boolean | undefined =
    (typeof options?.minify === "object" && options.minify.sourcemap) ||
    options?.transform?.sourcemap;

  const isolatedDeclarations: boolean | undefined =
    context.tsConfig?.compilerOptions?.isolatedDeclarations;

  const transform: OxcTransformOptions = {
    ...options?.transform,
    ...parser,
    cwd: input.srcPath ? dirname(input.srcPath) : undefined,
    typescript: {
      declaration:
        dts !== false && isolatedDeclarations === true
          ? {
              // @todo - Should we make this also the default for the bundler?
              stripInternal: true,
            }
          : undefined,
      ...options?.transform?.typescript,
    },
    sourcemap: sourceMapEnabled,
  };

  const minify: OxcMinifyOptions | undefined =
    options?.minify === true
      ? { sourcemap: sourceMapEnabled }
      : options?.minify
        ? { ...options?.minify, sourcemap: sourceMapEnabled }
        : undefined;

  return {
    resolve,
    parser,
    transform,
    minify,
    sourceConfig: processSourceConfig,
  };
}

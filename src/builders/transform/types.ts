import type { RawSourceMap } from "source-map-js";
import type { PostcssTransformerOptions } from "../../transformers/postcss.ts";
import type { VueTransformerOptions } from "../../transformers/vue.ts";
import type { TSConfig } from "pkg-types";
import type { BuildContext } from "../../types.ts";
import type { TransformDtsOptions } from "./dts/index.ts";

type MaybePromise<T> = T | Promise<T>;

export type TransformerName = "vue" | "sass" | "postcss" | (string & {});

export interface TransformerOptions
  extends VueTransformerOptions,
    PostcssTransformerOptions {
  /**
   * Declaration generation.
   *
   * Set to `false` to disable.
   */
  dts?: boolean | TransformDtsOptions;
}

export interface CreateTransformerOptions
  extends TransformerOptions,
    BuildContext {
  /**
   * List of transformers to use. Can be a list of transformer names (e.g. "oxc", "vue") or transformer functions.
   */
  transformers?: Array<TransformerName | Transformer>;

  /**
   * TypeScript configuration for the project.
   */
  tsConfig?: TSConfig;
}

export interface TransformerContext extends BuildContext {
  transformFile: TransformFile;

  /**
   * TypeScript configuration for the project.
   */
  tsConfig?: TSConfig;

  /**
   * Options passed to the transformer, such as `resolve` options for module resolution.
   */
  options: TransformerOptions;
}

export interface Transformer {
  /**
   * Unique name of the transformer.
   */
  name: string;

  /**
   * Function type for a transformer that processes an input file and returns an array of output files.
   *
   * @param input - The input file to transform.
   * @param context - The context for the transformation, including options and methods to transform files.
   * @return A promise that resolves to an array of output files or undefined if the transformation is not applicable.
   */
  transform: (
    input: InputFile,
    context: TransformerContext,
  ) => MaybePromise<TransformResult>;

  // hooks
}

interface File {
  /**
   * Relative path to `outDir`
   */
  path: string;

  /**
   * Absolute source path of the file
   */
  srcPath?: string;
}

export interface InputFile extends File {
  /**
   * File extension, e.g. `.ts`, `.mjs`, `.jsx`, `.d.mts`
   */
  extension: string;

  /**
   * Loads the raw contents of the file
   */
  getContents: () => MaybePromise<string>;
}

export interface OutputFile extends File {
  /**
   * File extension, e.g. `.ts`, `.mjs`, `.jsx`, `.d.mts`
   */
  extension?: string;

  /**
   * Contents of the file, if available.
   * If `declaration` is `true`, this will be used as the source for generating declarations.
   */
  contents?: string;

  /**
   * Set to `true` to skip writing this file to the output directory.
   */
  skip?: boolean;

  /**
   * Type of the output file, which can be one of:
   */
  type?: "code" | "minified" | "declaration" | "source-map" | "asset";

  /**
   * Generate declaration files after the transformations.
   * When set to `true`, the `contents` field will be used as source.
   */
  declaration?: boolean;

  /**
   * Indicates if the file is unmodified from the input.
   * When true, the file contents are ignored and copied directly from the source.
   */
  raw?: boolean;
}

export interface SourceMapFile extends OutputFile {
  type: "source-map";

  /**
   * The source map associated with the output file.
   *
   * NOTE: Fields `file` and `sources` must be relative to the `input` of the `TransformEntry` to be automatically resolved relative to the `mapDir` output directory.
   */
  map: RawSourceMap;
}

export type TransformResult = OutputFile[] | undefined;

/**
 * Function to transform a file using the provided transformers.
 *
 * @param input - The input file to transform.
 * @returns A promise that resolves to an array of output files.
 */
export type TransformFile = (input: InputFile) => MaybePromise<OutputFile[]>;

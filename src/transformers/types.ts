import type { OxcTransformerOptions } from "./oxc.ts";
import type { VueTransformerOptions } from "./vue.ts";

type MaybePromise<T> = T | Promise<T>;

export type TransformerName = "oxc" | "vue" | (string & {});

export interface TransformerOptions
  extends OxcTransformerOptions,
    VueTransformerOptions {}

export interface TransformerContext {
  transformFile: TransformFile;

  /**
   * Options passed to the transformer, such as `resolve` options for module resolution.
   */
  options: TransformerOptions;
}

/**
 * Function type for a transformer that processes an input file and returns an array of output files.
 *
 * @param input - The input file to transform.
 * @param context - The context for the transformation, including options and methods to transform files.
 * @return A promise that resolves to an array of output files or undefined if the transformation is not applicable.
 */
export type Transformer = (
  input: InputFile,
  context: TransformerContext,
) => MaybePromise<TransformResult>;

export interface InputFile {
  /**
   * Relative path to `outDir`
   */
  path: string;

  /**
   * File extension, e.g. `.ts`, `.mjs`, `.jsx`, `.d.mts`
   */
  extension: string;

  /**
   * Absolute source path of the file
   */
  srcPath?: string;

  /**
   * Loads the raw contents of the file
   */
  getContents: () => MaybePromise<string>;
}

export interface OutputFile {
  /**
   * Relative path to `outDir`
   */
  path: string;

  /**
   * File extension, e.g. `.js`, `.mjs`, `.jsx`, `.d.mts`
   */
  extension?: string;

  /**
   * Absolute source path of the file
   */
  srcPath?: string;

  /**
   * Contents of the file, if available
   */
  contents?: string;

  /**
   * Set to `true` to skip writing this file to the output directory.
   */
  skip?: boolean;

  /**
   * The file is a declaration file (e.g. `.d.mts`)
   *
   * If `"generate"` is set, the transformer will generate a declaration file from the source file.
   */
  declaration?: boolean | "generate";

  /**
   * The file is a source map (e.g. `.js.map`)
   */
  sourceMap?: boolean;

  /**
   * If the file is minified, this should be set to `true`.
   */
  minified?: boolean;

  /**
   * Whether the file is raw (not modified from the input)
   */
  raw?: boolean;
}

export type TransformResult = OutputFile[] | undefined;

/**
 * Function to transform a file using the provided transformers.
 *
 * @param input - The input file to transform.
 * @returns A promise that resolves to an array of output files.
 */
export type TransformFile = (input: InputFile) => MaybePromise<OutputFile[]>;

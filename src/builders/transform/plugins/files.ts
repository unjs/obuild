import type { SourceMap } from "./source-map.ts";

interface FileMetadata {
  /** Type of the output file, which can be one of: */
  type?: "code" | "minified" | "declaration" | "source-map" | "asset" | "raw";

  /** Relative path to `outDir` */
  readonly path: string;

  /** Absolute source path of the file */
  readonly srcPath?: string;

  /** File extension, e.g. `.ts`, `.mjs`, `.jsx` */
  extension: string;

  /** Contents of the file, if available. */
  contents?: string;

  /**
   * Set to `true` to skip writing this file to the output directory and prevent
   * it from further processing.
   */
  skip?: boolean;
}

export interface AssetFile extends FileMetadata {
  type: "asset";

  /** Asset contents, such as CSS. */
  contents: string;
}

export interface CodeFile extends FileMetadata {
  type: "code";

  /** Transformed source code */
  contents: string;
}

export interface DeclarationFile extends FileMetadata {
  type: "declaration";

  /** Generated declaration contents */
  contents: string;
}

export interface MinifiedFile extends FileMetadata {
  type: "minified";

  /** Minified source code */
  contents: string;
}

export interface RawFile extends FileMetadata {
  type: "raw";

  /** Raw files are copied as-is without transformation. */
  readonly contents?: undefined;
}

export interface SourceMapFile extends FileMetadata {
  type: "source-map";

  /** The original file associated with the source map, if available. */
  inputFile?: InputFile;

  /** The modified file associated with the source map. */
  outputFile: OutputFile;

  /** The source map associated with the output file. */
  map: SourceMap;
}

export interface InputFile extends FileMetadata {
  /** Source contents of the file */
  readonly contents: string;
}

export type OutputFile =
  | AssetFile
  | CodeFile
  | DeclarationFile
  | MinifiedFile
  | RawFile
  | SourceMapFile;

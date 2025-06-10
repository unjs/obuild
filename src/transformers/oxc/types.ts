import type { OutputFile, SourceMapFile } from "../types.ts";
import type { ResolveOptions as ExsolveOptions } from "exsolve";
import type { TransformOptions as OxcTransformOptions } from "oxc-transform";
import type { ParserOptions as OxcParserOptions } from "oxc-parser";
import type { MinifyOptions as OxcMinifyOptions } from "oxc-minify";

export type { SourceMapFile } from "../types.ts";

export interface ProcessableFile extends OutputFile {
  contents: string;
  extension: string;
}

export interface DeclarationFile extends OutputFile {
  type: "declaration";
}

export interface MinifiedFile extends ProcessableFile {
  type: "minified";
}

export interface TransformedSourceMapFile extends SourceMapFile {
  origin: "transformed";
}

export interface MinifiedSourceMapFile extends SourceMapFile {
  origin: "minified";
}

export type ProcessSourceConfig = {
  transform?: OxcParserOptions["lang"];
  extension?: `.${string}`;
};

export type ProcessOptions = {
  resolve: ExsolveOptions;
  parser: OxcParserOptions;
  transform: OxcTransformOptions;
  minify: OxcMinifyOptions | undefined;
  sourceConfig: ProcessSourceConfig;
};

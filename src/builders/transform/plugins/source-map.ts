/** Source map representation used in the output files. */
export interface SourceMap {
  /** The file name of the generated source map. */
  file?: string;

  /**
   * The root URL for the sources in the source map. This can be a relative or
   * absolute URL.
   */
  sourceRoot?: string;

  /**
   * The version of the source map format. Should be "3" for the current
   * version.
   */
  version: number;

  /**
   * The list of source files that the generated code is derived from. These
   * must be relative to the `input` of the `TransformEntry`.
   */
  sources: string[];

  /**
   * The list of variable names used in the source map. This is typically used
   * for minified code to map variable names back to their original names.
   */
  names: string[];

  /**
   * The mappings string that describes how the generated code maps back to the
   * original source files. This is in the format defined by the source map
   * specification.
   */
  sourcesContent?: string[];

  /**
   * The mappings string that describes how the generated code maps back to the
   * original source files. This is in the format defined by the source map
   * specification.
   */
  mappings: string;
}

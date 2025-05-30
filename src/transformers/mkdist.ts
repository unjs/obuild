import consola from "consola";
import type {
  InputFile,
  OutputFile,
  Transformer,
  TransformerContext,
} from "./types.ts";

type MaybePromise<T> = T | Promise<T>;

type MkdistOutputFile = Omit<
  OutputFile,
  "declaration" | "sourceMap" | "minified"
> & {
  errors?: Error[];
  declaration?: boolean;
};

type MkdistLoaderOptions = {
  /**
   * Declaration generation.
   *
   * Set to `false` to disable.
   */
  declaration?: boolean;
};

type MkdistLoaderContext = {
  loadFile: (input: InputFile) => MaybePromise<MkdistOutputFile[]>;
  options: MkdistLoaderOptions;
};

export type MkdistLoader = (
  input: InputFile,
  context: MkdistLoaderContext,
) => MaybePromise<MkdistOutputFile[] | undefined>;

/**
 * Creates a transformer that uses a mkdist loader for compatibility.
 *
 * @param loader - The mkdist loader function to use.
 * @param loaderOptions - Additional options for the mkdist loader.
 * @returns A transformer that can be used in the transformation process.
 */
export function mkdistLoader(
  loader: MkdistLoader,
  loaderOptions: MkdistLoaderOptions,
): Transformer {
  const DECLARATION_RE = /\.d\.[cm]?ts$/;
  const CM_LETTER_RE = /(?<=\.)(c|m)(?=[jt]s$)/;
  const KNOWN_EXT_RE = /\.(c|m)?[jt]sx?$/;

  /**
   * mkdist compatible JS loader that adds declaration file output for `.js` files also
   */
  const jsLoader = async (
    input: InputFile,
  ): Promise<MkdistOutputFile[] | undefined> => {
    if (
      loaderOptions.declaration === false ||
      !KNOWN_EXT_RE.test(input.path) ||
      DECLARATION_RE.test(input.path) ||
      input.srcPath?.match(DECLARATION_RE)
    ) {
      return;
    }

    const cm = input.srcPath?.match(CM_LETTER_RE)?.[0] || "";

    return [
      {
        contents: await input.getContents(),
        srcPath: input.srcPath,
        path: input.path,
        extension: `.d.${cm}ts`,
        declaration: true,
      },
    ];
  };

  const fromMkdistOutputFile: (output: MkdistOutputFile) => OutputFile = (
    output,
  ) => {
    if (output.errors && output.errors.length > 0) {
      consola.error(
        `Errors while processing "${output.path}" using mkdist loader:`,
      );
      for (const error of output.errors) {
        consola.error(error);
      }
    }

    if (
      output.declaration === true &&
      output.skip !== true &&
      !DECLARATION_RE.test(output.path)
    ) {
      return {
        ...output,
        declaration: "generate",
      };
    }

    return output;
  };

  const toMkdistOutputFile: (output: OutputFile) => MkdistOutputFile = (
    output,
  ) => {
    return {
      ...output,
      declaration:
        output.declaration === "generate" ? true : output.declaration,
    };
  };

  return async (input, context: TransformerContext) => {
    const mkdistContext: MkdistLoaderContext = {
      loadFile: async (inputFile: InputFile): Promise<MkdistOutputFile[]> => {
        const dtsOutput = (await jsLoader(inputFile)) || [];

        const output = await context.transformFile(inputFile);

        return [
          ...dtsOutput,
          ...output.map((file) => toMkdistOutputFile(file)),
        ];
      },
      options: loaderOptions,
    };

    const output = await loader(input, mkdistContext);

    return output?.map((file) => fromMkdistOutputFile(file)) || [];
  };
}

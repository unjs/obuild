import { pathToFileURL } from "node:url";
import { basename, dirname, extname, join, relative } from "node:path";
import { writeFile } from "node:fs/promises";
import { resolveModulePath } from "exsolve";
import MagicString from "magic-string";
import oxcTransform from "oxc-transform";
import oxcParser from "oxc-parser";
import { minify as oxcMinify } from "oxc-minify";

import type { ResolveOptions as ExsolveOptions } from "exsolve";
import type { TransformOptions as ExternalOxcTransformOptions } from "oxc-transform";
import type { ParserOptions as ExternalOxcParserOptions } from "oxc-parser";
import type { MinifyOptions as ExternalOxcMinifyOptions } from "oxc-minify";

import type {
  InputFile,
  OutputFile,
  Transformer,
  TransformerContext,
  TransformResult,
} from "./types.ts";

export interface OxcTransformerOptions {
  oxc?: {
    /**
     * Options for module resolution.
     *
     * See [exsolve](https://github.com/unjs/exsolve) for more details.
     */
    resolve?: Omit<ExsolveOptions, "from">;

    /**
     * Options passed to oxc-transform.
     *
     * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
     */
    transform?: ExternalOxcTransformOptions;

    /**
     * Minify the output using oxc-minify.
     *
     * Defaults to `false` if not provided.
     */
    minify?: boolean | ExternalOxcMinifyOptions;
  };
}

type TransformableFile = OutputFile & {
  contents: string;
  extension: string;
};

type SourceMapFile = OutputFile & {
  sourceMap: true;
};

type DeclarationFile = OutputFile & {
  declaration: true;
};

type MinifiedFile = OutputFile & {
  minified: true;
};

type ExtensionConfig = {
  transform?: boolean;
  declaration?: boolean;
  language?: ExternalOxcParserOptions["lang"];
  outputExtension?: `.${string}`;
};

const extensionConfigs: Record<string, ExtensionConfig | undefined> = {
  ".ts": {
    transform: true,
    declaration: true,
    language: "ts",
    outputExtension: ".mjs",
  },
  ".mts": {
    transform: true,
    declaration: true,
    language: "ts",
    outputExtension: ".mjs",
  },
  ".tsx": {
    transform: true,
    declaration: true,
    language: "tsx",
    outputExtension: ".mjs",
  },
  ".jsx": {
    transform: true,
    declaration: true,
    language: "jsx",
    outputExtension: ".mjs",
  },
  ".js": {},
  ".mjs": {},
  ".cjs": {},
};

const DECLARATION_RE = /\.d\.[cm]?ts$/;

export const oxcTransformer: Transformer = async (
  input,
  context,
): Promise<TransformResult> => {
  if (DECLARATION_RE.test(input.path)) {
    return;
  }

  const inputExtension = input.extension || extname(input.path);
  const extensionConfig = extensionConfigs[inputExtension];

  if (extensionConfig === undefined) {
    return;
  }

  const options = resolveOptions(input, context, extensionConfig);
  const codeFile: TransformableFile = {
    path: input.path,
    srcPath: input.srcPath,
    extension: extensionConfig.outputExtension || inputExtension,
    contents: await input.getContents(),
  };

  if (!extensionConfig.transform) {
    if (options.minify) {
      return minify(codeFile, options.minify);
    }

    return [codeFile];
  }

  const [transformedFile, ...declarationFiles] = await transform(
    rewriteSpecifiers(codeFile, options),
    options.transform,
  );

  if (options.minify) {
    const [minifiedFile, ...sourceMapFiles] = minify(
      transformedFile,
      options.minify,
    );

    return [minifiedFile, ...sourceMapFiles, ...declarationFiles];
  }

  return [transformedFile, ...declarationFiles];
};

function resolveOptions(
  input: InputFile,
  context: TransformerContext,
  config: ExtensionConfig,
) {
  const { oxc: options } = context.options;

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

  const parser: ExternalOxcParserOptions = {
    lang: config.language,
    sourceType: "module",
  };

  const transform: ExternalOxcTransformOptions = {
    ...options?.transform,
    ...parser,
    cwd: input.srcPath ? dirname(input.srcPath) : undefined,
    typescript: {
      declaration: {
        // @todo - Should we make this also the default for the bundler?
        stripInternal: true,
      },
      ...options?.transform?.typescript,
      ...(config.declaration === false ? { declaration: undefined } : {}),
    },
  };

  const minify: ExternalOxcMinifyOptions | false | undefined =
    options?.minify === true ? {} : options?.minify;

  return {
    resolve,
    parser,
    transform,
    minify,
  };
}

async function transform(
  input: Readonly<TransformableFile>,
  options: ExternalOxcTransformOptions,
): Promise<[TransformableFile] | [TransformableFile, DeclarationFile]> {
  const result = oxcTransform.transform(input.path, input.contents, options);
  const errors = result.errors.filter(
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
    contents: result.code,
  };

  if (!result.declaration) {
    return [transformedFile];
  }

  const declarationFile: DeclarationFile = {
    srcPath: input.srcPath,
    contents: result.declaration,
    declaration: true,
    path: input.path,
    extension: ".d.mts",
  };

  return [transformedFile, declarationFile];
}

function minify(
  input: Readonly<TransformableFile>,
  options?: ExternalOxcMinifyOptions,
): [MinifiedFile] | [MinifiedFile, TransformableFile, SourceMapFile] {
  const { code: minifedCode, map: sourceMap } = oxcMinify(
    input.path,
    input.contents,
    options,
  );

  const minifiedFile: MinifiedFile = {
    ...input,
    minified: true,
    contents: minifedCode,
  };

  if (!sourceMap) {
    return [minifiedFile];
  }

  // Create a new file with the `.src` extension prefix for the source map to use as the source file
  const sourceFile: TransformableFile = {
    ...input,
    extension: `.src${input.extension}`,
  };

  sourceMap.file = replaceExtension(input.path);
  sourceMap.sources = sourceMap.sources.map((source) => {
    return replaceExtension(basename(source), sourceFile.extension);
  });

  const sourceMapFile: SourceMapFile = {
    srcPath: input.srcPath,
    path: input.path,
    extension: `${input.extension}.map`,
    sourceMap: true,
    contents: JSON.stringify(sourceMap),
  };

  return [minifiedFile, sourceFile, sourceMapFile];
}

function replaceExtension(path: string, extension?: string): string {
  if (extension === undefined) {
    const config = extensionConfigs[extname(path)];

    if (config?.outputExtension === undefined) {
      return path;
    }

    extension = config.outputExtension;
  }

  return join(dirname(path), basename(path, extname(path))) + extension;
}

function rewriteSpecifiers(
  file: Readonly<TransformableFile>,
  options?: {
    parser?: ExternalOxcParserOptions;
    resolve?: ExsolveOptions;
  },
): TransformableFile {
  const { srcPath } = file;

  if (srcPath === undefined) {
    // Skip rewriting if srcPath is not available
    return { ...file };
  }

  const parsed = oxcParser.parseSync(file.path, file.contents, options?.parser);

  if (parsed.errors.length > 0) {
    throw new Error(`Errors while parsing ${file.path}:`, {
      cause: parsed.errors,
    });
  }

  const magicString = new MagicString(file.contents);

  // Rewrite relative imports
  const updatedStarts = new Set<number>();
  const rewriteSpecifier = (req: {
    value: string;
    start: number;
    end: number;
  }) => {
    const moduleId = req.value;
    if (!moduleId.startsWith(".")) {
      return;
    }
    if (updatedStarts.has(req.start)) {
      return; // prevent double rewritings
    }
    updatedStarts.add(req.start);
    const resolvedAbsolute = resolveModulePath(moduleId, {
      ...options?.resolve,
      from: pathToFileURL(srcPath),
    });
    const newId = relative(
      dirname(srcPath),
      replaceExtension(resolvedAbsolute),
    );
    magicString.remove(req.start, req.end);
    magicString.prependLeft(
      req.start,
      JSON.stringify(newId.startsWith(".") ? newId : `./${newId}`),
    );
  };

  for (const staticImport of parsed.module.staticImports) {
    rewriteSpecifier(staticImport.moduleRequest);
  }

  for (const staticExport of parsed.module.staticExports) {
    for (const staticExportEntry of staticExport.entries) {
      if (staticExportEntry.moduleRequest) {
        rewriteSpecifier(staticExportEntry.moduleRequest);
      }
    }
  }

  return {
    ...file,
    contents: magicString.toString(),
  };
}

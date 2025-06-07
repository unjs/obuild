import MagicString from "magic-string";
import { pathToFileURL } from "node:url";
import { basename, dirname, extname, join, relative } from "pathe";
import { resolveModulePath } from "exsolve";
import { parseSync as oxcParse } from "oxc-parser";
import { SourceMapConsumer, SourceMapGenerator } from "source-map-js";
import { getTargetExtension } from "./config.ts";

import type {
  MinifiedSourceMapFile,
  ProcessableFile,
  ProcessOptions,
  SourceMapFile,
  TransformedSourceMapFile,
} from "./types.ts";

/**
 * Replaces the file extension of a given path with a target extension.
 *
 * @param path - The file path to modify.
 * @param targetExtension - The target file extension to replace the current one with. If not provided, it will be determined based on the source extension.
 * @returns The modified file path with the target extension.
 */
export function replaceExtension(
  path: string,
  targetExtension?: string,
): string {
  const sourceExtension = extname(path);

  targetExtension ??= getTargetExtension(sourceExtension);

  if (targetExtension === undefined) {
    return path;
  }

  return join(dirname(path), basename(path, sourceExtension)) + targetExtension;
}

/**
 * Rewrites relative import specifiers in the given file to absolute paths.
 *
 * @param file - The file to process.
 * @param options - Optional options for resolving module paths and parsing.
 * @returns A new file with rewritten specifiers for relative imports and exports. If the file does not have a `srcPath`, it will return the original file without modifications.
 */
export function rewriteSpecifiers(
  file: Readonly<ProcessableFile>,
  options?: Pick<ProcessOptions, "resolve" | "parser">,
): ProcessableFile {
  const { srcPath } = file;

  if (srcPath === undefined) {
    // Skip rewriting if srcPath is not available
    return file;
  }

  const parsed = oxcParse(file.path, file.contents, options?.parser);

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

/**
 * Combines two source map files into one.
 *
 * @param transformedSourceMapFile - The transformed source map file, which is based on the original source code.
 * @param minifiedSourceMapFile - The minified source map file, which is based on the minified code.
 * @returns A merged source map file that combines the transformed and minified source maps.
 */
export function mergeSourceMapFiles(
  transformedSourceMapFile: Readonly<TransformedSourceMapFile> | undefined,
  minifiedSourceMapFile: Readonly<MinifiedSourceMapFile> | undefined,
): SourceMapFile | undefined {
  if (!transformedSourceMapFile) {
    return minifiedSourceMapFile;
  }

  if (!minifiedSourceMapFile) {
    return transformedSourceMapFile;
  }

  // The source map is based on the minified code
  const generator = SourceMapGenerator.fromSourceMap(
    new SourceMapConsumer(minifiedSourceMapFile.map),
  );

  // Apply the transformed source map to the minified map
  generator.applySourceMap(new SourceMapConsumer(transformedSourceMapFile.map));

  return {
    ...transformedSourceMapFile,
    map: {
      ...generator.toJSON(),
      file: basename(replaceExtension(minifiedSourceMapFile.path)),
    },
  };
}

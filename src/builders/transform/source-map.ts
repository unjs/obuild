import path from "pathe";
import { normalizePath } from "../../utils.ts";

import type { BuildContext, TransformEntry } from "../../types.ts";
import type { OutputFile, SourceMapFile } from "../../transformers/types.ts";

/**
 * Rewrite source map sources and file paths to relative paths and serialize them.
 *
 * @param files - The files to process.
 * @param entry - The transform entry containing the output directory.
 */
export function serializeSourceMapFiles(
  files: OutputFile[],
  entry: TransformEntry,
  context: BuildContext,
): void {
  const mapDir = resolveSourceMapDir(entry, context);
  const sourceMapFiles = files.filter(
    (file): file is SourceMapFile => file.type === "source-map",
  );

  // Rewrite source maps to relative paths and serialize them
  for (const sourceMapFile of sourceMapFiles) {
    const { map } = sourceMapFile;

    map.sources = map.sources.map((source) => {
      return path.relative(
        path.dirname(path.join(mapDir, source)),
        path.join(entry.input, source),
      );
    });

    if (map.file !== undefined) {
      map.file = path.relative(
        path.dirname(path.join(mapDir, sourceMapFile.path)),
        path.join(entry.outDir!, map.file),
      );
    }

    sourceMapFile.contents = JSON.stringify(sourceMapFile.map);
  }
}

/**
 * Resolve the absolute path to store the source maps.
 *
 * @param entry - Transform entry
 * @param context - Build context
 * @returns The absolute path to the source map directory.
 */
export function resolveSourceMapDir(
  entry: TransformEntry,
  context: BuildContext,
): string {
  if (entry.mapDir === undefined) {
    return entry.outDir!;
  }

  return normalizePath(entry.mapDir, context.pkgDir);
}

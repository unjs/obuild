import path from "pathe";
import { normalizePath } from "../../utils.ts";

import type { DeclarationFile, OutputFile } from "./plugins/index.ts";
import type { BuildContext, TransformEntry } from "../../types.ts";

/**
 * Rewrite source map sources and file paths to relative paths and serialize them.
 *
 * @param files - The files to process.
 * @param entry - The transform entry containing the output directory.
 */
export function serializeSourceMapFiles(
  files: OutputFile[],
  entry: TransformEntry,
): void {
  const declarationDir =
    entry.tsConfig?.compilerOptions?.declarationDir || entry.outDir!;

  // Rewrite source maps to relative paths and serialize them
  for (const file of files) {
    if (file.type !== "source-map") {
      continue;
    }
    const { map } = file;

    map.sources = map.sources.map((source) => {
      return path.relative(
        path.dirname(path.join(entry.mapDir!, source)),
        path.join(entry.input, source),
      );
    });

    if (
      (declarationDir !== entry.outDir || entry.mapDir! !== entry.outDir) &&
      file.outputFile.type === "declaration"
    ) {
      const declarationMapPath = path.join(entry.mapDir!, file.path);
      const declarationPath = path.join(declarationDir, file.path);

      replaceSourceMappingUrl(
        file.outputFile,
        path.relative(path.dirname(declarationPath), declarationMapPath),
      );

      if (map.file !== undefined) {
        map.file = path.relative(
          path.dirname(path.join(entry.mapDir!, file.path)),
          path.join(declarationDir, map.file),
        );
      }
    }

    file.contents = JSON.stringify(file.map, null, 2);
  }
}

/**
 * Replaces the `sourceMappingURL` path at the bottom of declaration files.
 */
function replaceSourceMappingUrl(
  declarationFile: DeclarationFile,
  path: string,
) {
  declarationFile.contents = declarationFile.contents.replace(
    /\/\/# sourceMappingURL=(.*)/,
    `//# sourceMappingURL=${path}`,
  );
}

/**
 * Resolve the absolute path to store the source maps.
 *
 * @param entry - Transform entry
 * @param context - Build context
 */
export function resolveSourceMapDir(
  entry: TransformEntry,
  context: BuildContext,
): void {
  if (entry.mapDir === undefined) {
    entry.mapDir = entry.outDir!;

    return;
  }

  entry.mapDir = normalizePath(entry.mapDir, context.pkgDir);
}

import path from "pathe";
import { promises as fsp, readFileSync } from "node:fs";
import { consola } from "consola";
import { glob } from "tinyglobby";
import { fmtPath } from "../utils.ts";
import { colors as c } from "consola/utils";
import { resolveTSConfig } from "./transform/ts-config.ts";
import { createTransformer } from "./transform/transformer.ts";
import {
  hasFileShebang,
  hasShebang,
  makeExecutable,
} from "./plugins/shebang.ts";
import {
  resolveSourceMapDir,
  serializeSourceMapFiles,
} from "./transform/source-map.ts";

import type { OutputFile } from "./transform/plugins/index.ts";
import type { BuildContext, TransformEntry } from "../types.ts";

type WritableFile = OutputFile & { path: string };

/**
 * Transform a directory of files using the specified transformers in the entry.
 *
 * @param context - Build context
 * @param entry - Transform entry
 */
export async function transformDir(
  context: BuildContext,
  entry: TransformEntry,
): Promise<void> {
  if (entry.stub) {
    consola.log(
      `${c.magenta("[stub transform]   ")} ${c.underline(fmtPath(entry.outDir!) + "/")}`,
    );
    await fsp.symlink(entry.input, entry.outDir!, "junction");
    return;
  }

  resolveTSConfig(entry, context);
  resolveSourceMapDir(entry, context);

  const transformer = await createTransformer({
    ...context,
    entry,
  });

  await transformer.callHook("buildStart");

  const inputFileNames = await glob("**/*.*", { cwd: entry.input });
  const transformPromises: Promise<OutputFile[]>[] = inputFileNames.map(
    async (fileName) => {
      const srcPath = path.join(entry.input, fileName);

      let contents: string | undefined;

      return transformer.transform({
        path: fileName,
        extension: path.extname(srcPath),
        srcPath: srcPath,
        get contents() {
          if (contents === undefined) {
            contents = readFileSync(srcPath, "utf8");
          }

          return contents;
        },
      });
    },
  );

  const transformedFiles = await Promise.all(transformPromises).then(
    (results) => results.flat().filter((file) => file.skip !== true),
  );

  await transformer.callHook("buildEnd", transformedFiles);

  const outputFiles: WritableFile[] = transformedFiles.filter(
    (file) => file.skip !== true,
  );

  // Rename files to their desired extensions
  renameFiles(outputFiles);

  // Rewrite and serialize source map sources to relative paths
  serializeSourceMapFiles(outputFiles, entry);

  await transformer.callHook("writeStart", outputFiles);

  const writePromises: Promise<string>[] = outputFiles
    .filter((file) => file.skip !== true)
    .map(async (file) => {
      const { contents = "" } = file;
      const outputFilePath = getOutputFilePath(file, entry);

      await fsp.mkdir(path.dirname(outputFilePath), { recursive: true });

      let shebangFound: boolean;

      if (file.type === "raw" && file.srcPath !== undefined) {
        [shebangFound] = await Promise.all([
          // Avoid loading possibly large raw file contents into memory
          hasFileShebang(file.srcPath),
          fsp.copyFile(file.srcPath, outputFilePath),
        ]);
      } else {
        shebangFound = hasShebang(contents);
        await fsp.writeFile(outputFilePath, contents, "utf8");
      }

      if (shebangFound) {
        await makeExecutable(outputFilePath);
      }

      return outputFilePath;
    });

  const writtenFileNames = await Promise.all(writePromises);

  await transformer.callHook("writeEnd", writtenFileNames);

  consola.log(
    `\n${c.magenta("[transform] ")}${c.underline(fmtPath(entry.outDir!) + "/")}\n${writtenFileNames
      .map((f) => c.dim(fmtPath(f)))
      .join("\n")}`,
  );
}

/**
 * Rename output files to their desired extensions.
 *
 * @param files - The output files to process.
 */
function renameFiles(files: WritableFile[]): void {
  for (const file of files) {
    if (file.extension === undefined || file.path.endsWith(file.extension)) {
      continue;
    }

    const originalExtension = path.extname(file.path);

    if (originalExtension === file.extension) {
      continue;
    }

    file.path = path.join(
      path.dirname(file.path),
      path.basename(file.path, originalExtension) + file.extension,
    );
  }
}

/**
 * Get the output path for a given output file in a transform entry.
 *
 * @param file - Output file to resolve the path for
 * @param entry - Transform entry
 * @returns - The absolute path to the output file.
 */
function getOutputFilePath(file: OutputFile, entry: TransformEntry): string {
  switch (file.type) {
    case "declaration": {
      return path.join(
        entry.tsConfig?.compilerOptions?.declarationDir || entry.outDir!,
        file.path,
      );
    }

    case "source-map": {
      return path.join(entry.mapDir!, file.path);
    }

    default: {
      return path.join(entry.outDir!, file.path);
    }
  }
}

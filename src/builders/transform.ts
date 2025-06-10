import path from "pathe";
import { promises as fsp } from "node:fs";
import { consola } from "consola";
import { glob } from "tinyglobby";
import { fmtPath } from "../utils.ts";
import { colors as c } from "consola/utils";
import { createTransformer } from "../transformers/index.ts";
import { resolveTSConfig } from "./transform/ts-config.ts";
import { generateDeclarations } from "./transform/dts/index.ts";
import {
  hasFileShebang,
  hasShebang,
  makeExecutable,
} from "./plugins/shebang.ts";
import {
  resolveSourceMapDir,
  serializeSourceMapFiles,
} from "./transform/source-map.ts";

import type { OutputFile } from "../transformers/types.ts";
import type { BuildContext, TransformEntry } from "../types.ts";

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

  const tsConfig = resolveTSConfig(entry, context);
  const transformer = createTransformer({
    ...entry,
    tsConfig,
    dts: entry.dts !== false,
  });
  const inputFileNames = await glob("**/*.*", { cwd: entry.input });
  const transformPromises: Promise<OutputFile[]>[] = inputFileNames.map(
    async (inputFileName) => {
      const inputFilePath = path.join(entry.input, inputFileName);

      return transformer.transformFile({
        path: inputFileName,
        extension: path.extname(inputFilePath),
        srcPath: inputFilePath,
        getContents() {
          return fsp.readFile(inputFilePath, "utf8");
        },
      });
    },
  );

  const outputFiles = await Promise.all(transformPromises).then((results) =>
    results.flat(),
  );

  // Post transform declaration generation
  await generateDeclarations(outputFiles, tsConfig, entry, context);

  // Rename files to their desired extensions
  renameFiles(outputFiles);

  // Rewrite and serialize source map sources to relative paths
  serializeSourceMapFiles(outputFiles, entry, context);

  const writePromises: Promise<string>[] = outputFiles
    .filter((outputFile) => !outputFile.skip)
    .map(async (outputFile) => {
      const { path: filePath, raw, contents = "" } = outputFile;
      const outputFilePath = getOutputFilePath(outputFile, entry, context);

      await fsp.mkdir(path.dirname(outputFilePath), { recursive: true });

      let shebangFound: boolean;

      if (raw) {
        const srcPath = outputFile.srcPath || path.join(entry.input, filePath);

        [shebangFound] = await Promise.all([
          // Avoid loading possibly large raw file contents into memory
          hasFileShebang(srcPath),
          fsp.copyFile(srcPath, outputFilePath),
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

  const writtenFiles = await Promise.all(writePromises);

  consola.log(
    `\n${c.magenta("[transform] ")}${c.underline(fmtPath(entry.outDir!) + "/")}\n${writtenFiles
      .map((f) => c.dim(fmtPath(f)))
      .join("\n")}`,
  );
}

/**
 * Rename output files to their desired extensions.
 *
 * @param files - The output files to process.
 */
function renameFiles(files: OutputFile[]): void {
  for (const file of files) {
    if (file.extension === undefined) {
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
 * @param outputFile - Output file to resolve the path for
 * @param entry - Transform entry
 * @param context - Build context
 * @returns - The absolute path to the output file.
 */
function getOutputFilePath(
  outputFile: OutputFile,
  entry: TransformEntry,
  context: BuildContext,
): string {
  switch (outputFile.type) {
    case "source-map": {
      return path.join(resolveSourceMapDir(entry, context), outputFile.path);
    }

    default: {
      return path.join(entry.outDir!, outputFile.path);
    }
  }
}

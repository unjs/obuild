import type { BuildContext, TransformEntry } from "../types.ts";

import { consola } from "consola";
import { colors as c } from "consola/utils";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { glob } from "tinyglobby";
import { fmtPath } from "../utils.ts";
import { makeExecutable, SHEBANG_RE } from "./plugins/shebang.ts";
import { createTransformer } from "../transformers/index.ts";
import type { OutputFile } from "../transformers/types.ts";

/**
 * Transform all files in a directory using oxc-transform.
 */
export async function transformDir(
  context: BuildContext,
  entry: TransformEntry,
): Promise<void> {
  if (entry.stub) {
    consola.log(
      `${c.magenta("[stub transform]   ")} ${c.underline(fmtPath(entry.outDir!) + "/")}`,
    );
    await symlink(entry.input, entry.outDir!, "junction");
    return;
  }

  const transformer = createTransformer(entry.transformers, entry);
  const inputFileNames = await glob("**/*.*", { cwd: entry.input });
  const transformPromises: Promise<OutputFile[]>[] = inputFileNames.map(
    async (inputFileName) => {
      const inputFilePath = join(entry.input, inputFileName);

      return transformer.transformFile({
        path: inputFileName,
        extension: extname(inputFilePath),
        srcPath: inputFilePath,
        getContents() {
          return readFile(inputFilePath, "utf8");
        },
      });
    },
  );

  const outputFiles = await Promise.all(transformPromises).then((results) =>
    results.flat(),
  );

  // Rename output files to their new extensions
  for (const output of outputFiles.filter((output) => output.extension)) {
    const originalExtension = extname(output.path);

    if (originalExtension === output.extension) {
      continue;
    }

    output.path = join(
      dirname(output.path),
      basename(output.path, originalExtension) + output.extension,
    );
  }

  const dtsOutputFiles = outputFiles.filter(
    (output) => !output.skip && output.declaration === "generate",
  );

  if (dtsOutputFiles.length > 0) {
    // @todo - Support generating declaration files
    for (const dtsOutputFile of dtsOutputFiles) {
      dtsOutputFile.skip = true;

      consola.warn(
        `Generating declaration file "${dtsOutputFile.path}" is currently not supported.`,
      );
    }
  }

  const outputPromises: Promise<string>[] = outputFiles
    .filter((outputFile) => !outputFile.skip)
    .map(async (outputFile) => {
      let code = outputFile.contents || "";
      const outputFilePath = join(entry.outDir!, outputFile.path);

      await mkdir(dirname(outputFilePath), { recursive: true });

      if (outputFile.raw) {
        if (outputFile.srcPath === undefined) {
          throw new TypeError("`srcPath` can't be undefined for raw files.");
        }

        code = await readFile(outputFile.srcPath, "utf8");
      }

      await writeFile(outputFilePath, code, "utf8");

      if (SHEBANG_RE.test(code)) {
        await makeExecutable(outputFilePath);
      }

      return outputFilePath;
    });

  const writtenFiles = await Promise.all(outputPromises);

  consola.log(
    `\n${c.magenta("[transform] ")}${c.underline(fmtPath(entry.outDir!) + "/")}\n${writtenFiles
      .map((f) => c.dim(fmtPath(f)))
      .join("\n\n")}`,
  );
}

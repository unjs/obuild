import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { defu } from "defu";
import { consola } from "consola";
import { glob } from "tinyglobby";
import { colors as c } from "consola/utils";
import type { TSConfig } from "pkg-types";

import { makeExecutable, SHEBANG_RE } from "./plugins/shebang.ts";
import { createTransformer } from "../transformers/index.ts";
import { getVueDeclarations } from "./utils/vue-dts.ts";
import { fmtPath } from "../utils.ts";
import type { OutputFile } from "../transformers/types.ts";
import type { BuildContext, TransformEntry } from "../types.ts";
import {
  getDeclarations,
  normalizeCompilerOptions,
  type DeclarationOutput,
} from "./utils/dts.ts";

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

  const dtsOutputFiles = outputFiles.filter(
    (output) =>
      output.srcPath !== undefined &&
      !output.skip &&
      output.declaration === "generate",
  ) as Array<OutputFile & { srcPath: string }>;

  if (dtsOutputFiles.length > 0) {
    const tsConfig: TSConfig = {};

    // Read and normalise TypeScript compiler options for emitting declarations
    if (tsConfig.compilerOptions) {
      tsConfig.compilerOptions = await normalizeCompilerOptions(
        tsConfig.compilerOptions,
      );
    }
    tsConfig.compilerOptions = defu(
      { noEmit: false } satisfies TSConfig["compilerOptions"],
      tsConfig.compilerOptions,
      {
        allowJs: true,
        declaration: true,
        skipLibCheck: true,
        strictNullChecks: true,
        emitDeclarationOnly: true,
        allowImportingTsExtensions: true,
        allowNonTsExtensions: true,
      } satisfies TSConfig["compilerOptions"],
    );

    // @todo - Support generating declaration files
    const vfs = new Map(
      dtsOutputFiles.map((o) => [o.srcPath, o.contents || ""]),
    );

    const declarations: DeclarationOutput = Object.create(null);
    for (const dtsGenerator of [getVueDeclarations, getDeclarations]) {
      Object.assign(
        declarations,
        await dtsGenerator(vfs, {
          rootDir: context.pkgDir,
          typescript: tsConfig,
        }),
      );
    }

    for (const output of dtsOutputFiles) {
      const result = declarations[output.srcPath];
      output.contents = result?.contents || "";

      if (result.errors) {
        output.skip = true;

        consola.warn(
          `\n${c.yellow("[transform] ")}${c.dim(fmtPath(output.srcPath))}:\n` +
            result.errors.map((e) => `  - ${e}`).join("\n"),
        );
      }
    }
  }

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

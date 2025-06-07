import consola from "consola";
import { getTscDeclarations } from "./tsc.ts";
import { getTsgoDeclarations } from "./tsgo.ts";
import { getVueDeclarations } from "./vue-tsc.ts";

import type { TSConfig } from "pkg-types";
import type { OutputFile } from "../transformers/types.ts";
import type { BuildContext, TransformEntry } from "../types.ts";
import type { DeclarationOptions } from "./common.ts";
import type { DeclarationOutput } from "./common.ts";

export { type DeclarationOutput } from "./common.ts";

export type TransformDtsOptions = Pick<
  DeclarationOptions,
  "relativeExtensions" | "tsgo" | "typescript"
>;

/**
 * Post-process output files to generate declarations.
 * Files marked with `declaration: true` will be processed.
 *
 * @param files - The output files to check. Files marked with `skip` or without a `srcPath` will be ignored.
 * @param tsConfig - TypeScript configuration to use for declaration generation.
 * @param entry - Transform entry
 * @param context - Build context
 * @returns A promise that resolves when declaration generation is complete.
 */
export async function generateDeclarations(
  files: OutputFile[],
  tsConfig: TSConfig,
  entry: TransformEntry,
  context: BuildContext,
): Promise<void> {
  if (entry.dts === false) {
    for (const file of files) {
      if (file.type !== "declaration" || file.declaration !== true) {
        continue;
      }

      file.skip = true;
    }

    return;
  }

  const declarationFiles: Array<OutputFile & { srcPath: string }> = [];

  for (const file of files) {
    if (
      file.srcPath === undefined ||
      file.skip === true ||
      file.declaration !== true
    ) {
      continue;
    }

    declarationFiles.push(file as OutputFile & { srcPath: string });

    if (file.extension !== ".d.mts") {
      continue;
    }

    // If the desired extension is `.d.mts` the input files must be `.mts`
    file.srcPath = file.srcPath.replace(/\.ts$/, ".mts");
  }

  if (declarationFiles.length === 0) {
    return;
  }

  const declarationOptions: DeclarationOptions = {
    ...(typeof entry.dts === "object" ? entry.dts : {}),
    pkg: context.pkg,
    pkgDir: context.pkgDir,
    inputDir: entry.input,
    typescript: tsConfig,
  };

  const vfs = new Map(
    declarationFiles.map((file) => [file.srcPath, file.contents || ""]),
  );

  const tsgo = typeof entry.dts === "object" && entry.dts.tsgo;

  if (tsgo) {
    consola.warn(
      "The `tsgo` option is experimental and may change in the future.",
    );
  }

  const dtsGenerators = [
    getVueDeclarations,
    tsgo ? getTsgoDeclarations : getTscDeclarations,
  ];

  const declarations: DeclarationOutput = Object.create(null);
  for (const dtsGenerator of dtsGenerators) {
    Object.assign(declarations, await dtsGenerator(vfs, declarationOptions));
  }

  for (const declarationFile of declarationFiles) {
    const result = declarations[declarationFile.srcPath];

    declarationFile.type = "declaration";
    declarationFile.contents = result?.contents || "";

    if (result?.errors) {
      declarationFile.skip = true;
    }
  }
}

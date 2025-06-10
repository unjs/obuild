import { createRequire } from "node:module";
import { readPackageJSON } from "pkg-types";
import { resolve as resolveModule } from "mlly";
import consola from "consola";

import {
  augmentWithDiagnostics,
  createVFSCompilerHost,
  extractDeclarations,
  normalizeCompilerOptions,
} from "./common.ts";

import type { DeclarationOptions, DeclarationOutput, VFS } from "./common.ts";

const SFC_EXT_RE = /\.vue\.m?[jt]s$/;

/**
 * Generates TypeScript declarations for Vue Single File Components (SFCs)
 * using the `vue-tsc` compiler.
 *
 * @param vfs A Map representing a virtual file system (filePath -> content).
 * @param options Options for declaration generation.
 * @returns Declaration output containing generated files and diagnostics, or undefined if no Vue SFCs are found.
 */
export async function getVueDeclarations(
  vfs: VFS,
  options: DeclarationOptions,
): Promise<DeclarationOutput | undefined> {
  const fileMapping = getFileMapping(vfs);
  const sourceFiles = Object.keys(fileMapping);
  const originFiles = Object.values(fileMapping);

  if (originFiles.length === 0) {
    return undefined;
  }

  if (!(await readPackageJSON("vue-tsc").catch(() => null))) {
    consola.warn("Please install `vue-tsc` to generate Vue SFC declarations.");

    return undefined;
  }

  const ts = await import("typescript").then((r) => r.default || r);
  const requireVueTsc = createRequire(await resolveModule("vue-tsc"));
  const vueLanguageCore: typeof import("@vue/language-core") =
    requireVueTsc("@vue/language-core");
  const volarTs: typeof import("@volar/typescript") =
    requireVueTsc("@volar/typescript");

  const normalizedCompiledOptions = await normalizeCompilerOptions(
    options.typescript?.compilerOptions,
  );

  const compilerOptions = {
    ...normalizedCompiledOptions,
    isolatedDeclarations: false,
    allowNonTsExtensions: true,
  };

  const tsHost = createVFSCompilerHost(vfs, compilerOptions, ts);
  const createProgram = volarTs.proxyCreateProgram(ts, ts.createProgram, () => [
    vueLanguageCore.createVueLanguagePlugin(
      ts,
      compilerOptions,
      vueLanguageCore.createParsedCommandLineByJson(
        ts,
        ts.sys,
        options.pkgDir,
        {},
      ).vueOptions,
      (id: string) => id,
    ),
  ]);

  const program = createProgram({
    rootNames: sourceFiles,
    options: compilerOptions,
    host: tsHost,
  });
  const result = program.emit();
  const output = await extractDeclarations(vfs, originFiles, options);

  augmentWithDiagnostics(result, output, tsHost, ts);

  return output;
}

/**
 * Creates a mapping of Vue SFC source files to their corresponding .vue files.
 *
 * @param vfs - The virtual file system containing the source files.
 * @returns A record mapping .vue files to their original source paths.
 */
function getFileMapping(vfs: VFS): Record<string, string> {
  const files: Record<string, string> = Object.create(null);

  for (const srcPath of vfs.keys()) {
    if (SFC_EXT_RE.test(srcPath)) {
      files[srcPath.replace(SFC_EXT_RE, ".vue")] = srcPath;
    }
  }

  return files;
}

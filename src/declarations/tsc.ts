import {
  augmentWithDiagnostics,
  createVfsCompilerHost,
  extractDeclarations,
  normalizeCompilerOptions,
  type DeclarationOptions,
  type DeclarationOutput,
} from "./common.ts";

/**
 * Generates TypeScript declarations using the TypeScript compiler (tsc).
 *
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @param opts - Options for declaration generation, including TypeScript compiler options.
 * @returns The declaration output containing generated files and diagnostics.
 */
export async function getTscDeclarations(
  vfs: Map<string, string>,
  opts: DeclarationOptions,
): Promise<DeclarationOutput | undefined> {
  if (vfs.size === 0) {
    return undefined;
  }

  const ts = await import("typescript").then((r) => r.default || r);

  const inputFiles = [...vfs.keys()];
  const compilerOptions = await normalizeCompilerOptions(
    opts.typescript?.compilerOptions || {},
  );

  const tsHost = createVfsCompilerHost(vfs, compilerOptions, ts);
  const program = ts.createProgram(inputFiles, compilerOptions, tsHost);
  const result = program.emit();

  const output = await extractDeclarations(vfs, inputFiles, opts);

  augmentWithDiagnostics(result, output, tsHost, ts);

  return output;
}

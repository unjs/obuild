import { statSync } from "node:fs";
import { resolve } from "pathe";
import {
  findStaticImports,
  findDynamicImports,
  findExports,
  findTypeExports,
} from "mlly";

import type { CompilerHost, CompilerOptions, EmitResult } from "typescript";
import type { PackageJson, TSConfig } from "pkg-types";

export type VFS = Map<string, string>;

export type DeclarationOptions = {
  /**
   * Package.json object representing the project.
   */
  pkg: PackageJson;

  /**
   * Directory where the root of the project is located.
   */
  pkgDir: string;

  /**
   * Directory containing the input files to process.
   */
  inputDir: string;

  /**
   * Whether to add relative declaration extensions to imports and exports.
   */
  relativeExtensions?: boolean;

  /**
   * Enable experimental support for `tsgo` in rolldown and declaration generation.
   * To use this option, make sure `@typescript/native-preview` is installed as a dependency.
   *
   * NOTE: This option is experimental and may change in the future.
   */
  tsgo?: boolean;

  /**
   * TypeScript compiler options.
   */
  typescript?: {
    compilerOptions?: TSConfig["compilerOptions"];
  };
};

export type DeclarationOutput = Record<
  string,
  { contents: string; errors?: Error[] }
>;

const JS_EXT_RE = /\.(m)?(ts|js)$/;
const DTS_EXT_RE = /\.(m)?(ts|js)x?$/;
const RELATIVE_RE = /^\.{1,2}[/\\]/;

/**
 * Normalizes TypeScript compiler options from a TSConfig object.
 *
 * @param input - tsconfig.json `compilerOptions` object.
 * @returns Normalized compiler options.
 */
export async function normalizeCompilerOptions(
  input: TSConfig["compilerOptions"],
): Promise<CompilerOptions> {
  const ts = await import("typescript").then((r) => r.default || r);

  return ts.convertCompilerOptionsFromJson(input, process.cwd()).options;
}

/**
 * Creates a TypeScript compiler host that uses a virtual file system (VFS).
 *
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @param options - TypeScript compiler options.
 * @param ts - The TypeScript module to use for creating the compiler host.
 * @returns A TypeScript compiler host that reads from and writes to the VFS.
 */
export function createVFSCompilerHost(
  vfs: VFS,
  options: CompilerOptions,
  ts: typeof import("typescript"),
): CompilerHost {
  const host = ts.createCompilerHost(options);

  host.writeFile = (fileName: string, contents: string) => {
    vfs.set(fileName, contents);
  };

  const originalReadFile = host.readFile.bind(host);
  host.readFile = (fileName: string) => {
    return vfs.get(fileName) ?? originalReadFile(fileName);
  };

  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (fileName: string) => {
    return vfs.has(fileName) || originalFileExists(fileName);
  };

  return host;
}

/**
 * Extracts TypeScript declaration files from a virtual file system (VFS).
 *
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @param inputFiles - The list of input files to process.
 * @param options - Options for declaration generation, including TypeScript compiler options.
 * @returns An object containing the generated declaration files and any errors encountered.
 */
export async function extractDeclarations(
  vfs: VFS,
  inputFiles: string[],
  options: DeclarationOptions,
): Promise<DeclarationOutput> {
  const output: DeclarationOutput = {};

  for (const filename of inputFiles) {
    const dtsFilename = filename.replace(DTS_EXT_RE, ".d.$1ts");
    let contents = vfs.get(dtsFilename) || "";

    if (options.relativeExtensions) {
      contents = addRelativeExtensions(contents, filename, vfs);
    }

    output[filename] = { contents };
    vfs.delete(filename);
  }

  return output;
}

/**
 * Add declaration extensions to relative imports in the given contents.
 *
 * @param contents - The source code contents to modify.
 * @param fileName - The name of the file being processed.
 * @param vfs - A Map representing a virtual file system (filePath -> content).
 * @returns The modified contents with updated import/export paths.
 */
function addRelativeExtensions(
  contents: string,
  fileName: string,
  vfs: VFS,
): string {
  const ext = fileName.match(JS_EXT_RE)?.[0].replace(/ts$/, "js") || ".mjs";

  const imports = [
    ...findStaticImports(contents),
    ...findExports(contents),
    ...findTypeExports(contents),
    ...findDynamicImports(contents).map((imp) => {
      let specifier: string | undefined;
      try {
        specifier = JSON.parse(imp.expression);
      } catch {
        // Ignore error
      }

      return { code: imp.code, specifier };
    }),
  ];

  for (const statement of imports) {
    if (!statement.specifier || !RELATIVE_RE.test(statement.specifier)) {
      continue;
    }

    const srcPath = resolve(fileName, "..", statement.specifier);
    const srcDtsPath =
      // Clear the extension to ensure we get the correct declaration file path
      srcPath.replace(JS_EXT_RE, "") + ext.replace(JS_EXT_RE, ".d.$1ts");

    const hasDts = vfs.has(srcDtsPath);

    if (hasDts === false && JS_EXT_RE.test(srcPath)) {
      // Already has an extension, but not a declaration
      continue;
    }

    let specifier = statement.specifier;
    try {
      if (hasDts === false && statSync(srcPath).isDirectory()) {
        specifier += "/index";
      }
    } catch {
      // src file does not exists
    }

    const replacement = statement.code.replace(
      statement.specifier,
      // add file extension for relative paths, but avoid double extension
      specifier.replace(JS_EXT_RE, "") + ext,
    );

    contents = contents.replace(statement.code, replacement);
  }

  return contents;
}

/**
 * Augments the emit result with diagnostics and updates the output object.
 *
 * @param result - The result of the TypeScript emit operation.
 * @param output - The output object to augment with diagnostics.
 * @param host - The TypeScript compiler host used for formatting diagnostics.
 * @param ts - The TypeScript module to use for formatting diagnostics.
 */
export function augmentWithDiagnostics(
  result: EmitResult,
  output: DeclarationOutput,
  host: CompilerHost,
  ts: typeof import("typescript"),
): void {
  if (result.diagnostics?.length) {
    for (const diagnostic of result.diagnostics) {
      const filename = diagnostic.file?.fileName;

      if (filename !== undefined && filename in output) {
        output[filename].errors = output[filename].errors || [];
        output[filename].errors.push(
          new TypeError(ts.formatDiagnostics([diagnostic], host), {
            cause: diagnostic,
          }),
        );
      }
    }

    console.error(ts.formatDiagnostics(result.diagnostics, host));
  }
}

import { statSync } from "node:fs"; // @todo - Use oxc-parser?
import { resolve } from "pathe";
import type { CompilerHost, CompilerOptions, EmitResult } from "typescript";
import type { TSConfig } from "pkg-types";

export type DeclarationOptions = {
  rootDir: string;
  addRelativeDeclarationExtensions?: boolean;
  typescript?: {
    compilerOptions?: CompilerOptions;
  };
};

export type DeclarationOutput = Record<
  string,
  { contents: string; errors?: Error[] }
>;

export async function normalizeCompilerOptions(
  input: TSConfig["compilerOptions"],
): Promise<CompilerOptions> {
  const ts = await import("typescript").then((r) => r.default || r);
  return ts.convertCompilerOptionsFromJson(input, process.cwd()).options;
}

export async function getDeclarations(
  vfs: Map<string, string>,
  opts?: DeclarationOptions,
): Promise<DeclarationOutput> {
  const ts = await import("typescript").then((r) => r.default || r);
  const inputFiles = [...vfs.keys()];
  const compilerOptions = opts?.typescript?.compilerOptions || {};
  const tsHost = ts.createCompilerHost(compilerOptions);

  const tsHostReadFile = tsHost.readFile;
  tsHost.readFile = (filename) => {
    if (vfs.has(filename)) {
      return vfs.get(filename);
    }
    return tsHostReadFile(filename);
  };
  tsHost.writeFile = (fileName: string, declaration: string) => {
    vfs.set(fileName, declaration);
  };

  const program = ts.createProgram(inputFiles, compilerOptions, tsHost);
  const result = program.emit();
  const output = await extractDeclarations(vfs, inputFiles, opts);

  augmentWithDiagnostics(result, output, tsHost, ts);

  return output;
}

const JS_EXT_RE = /\.(m|c)?(ts|js)$/;
const JSX_EXT_RE = /\.(m|c)?(ts|js)x?$/;
const RELATIVE_RE = /^\.{1,2}[/\\]/;

export async function extractDeclarations(
  vfs: Map<string, string>,
  inputFiles: string[],
  opts?: DeclarationOptions,
): Promise<DeclarationOutput> {
  const output: DeclarationOutput = {};

  for (const filename of inputFiles) {
    const dtsFilename = filename.replace(JSX_EXT_RE, ".d.$1ts");
    let contents = vfs.get(dtsFilename) || "";
    if (opts?.addRelativeDeclarationExtensions) {
      const {
        findStaticImports,
        findDynamicImports,
        findExports,
        findTypeExports,
      } = await import("mlly");

      const ext = filename.match(JS_EXT_RE)?.[0].replace(/ts$/, "js") || ".js";
      const imports = findStaticImports(contents);
      const exports = findExports(contents);
      const typeExports = findTypeExports(contents);
      const dynamicImports = findDynamicImports(contents).map(
        (dynamicImport) => {
          let specifier: string | undefined;
          try {
            const value = JSON.parse(dynamicImport.expression);
            if (typeof value === "string") {
              specifier = value;
            }
          } catch {
            // ignore the error
          }
          return {
            code: dynamicImport.code,
            specifier,
          };
        },
      );
      for (const spec of [
        ...exports,
        ...typeExports,
        ...imports,
        ...dynamicImports,
      ]) {
        if (!spec.specifier || !RELATIVE_RE.test(spec.specifier)) {
          continue;
        }
        const srcPath = resolve(filename, "..", spec.specifier);
        const srcDtsPath = srcPath + ext.replace(JS_EXT_RE, ".d.$1ts");
        let specifier = spec.specifier;
        try {
          if (!vfs.get(srcDtsPath)) {
            const stat = statSync(srcPath);
            if (stat.isDirectory()) {
              specifier += "/index";
            }
          }
        } catch {
          // src file does not exists
        }
        // add file extension for relative paths (`.js` will match the `.d.ts` extension we emit)
        contents = contents.replace(
          spec.code,
          spec.code.replace(spec.specifier, specifier + ext),
        );
      }
    }
    output[filename] = { contents };

    vfs.delete(filename);
  }

  return output;
}

export function augmentWithDiagnostics(
  result: EmitResult,
  output: DeclarationOutput,
  tsHost: CompilerHost,
  ts: typeof import("typescript"),
): void {
  if (result.diagnostics?.length) {
    for (const diagnostic of result.diagnostics) {
      const filename = diagnostic.file?.fileName;

      if (filename !== undefined && filename in output) {
        output[filename].errors = output[filename].errors || [];
        output[filename].errors.push(
          new TypeError(ts.formatDiagnostics([diagnostic], tsHost), {
            cause: diagnostic,
          }),
        );
      }
    }

    console.error(ts.formatDiagnostics(result.diagnostics, tsHost));
  }
}

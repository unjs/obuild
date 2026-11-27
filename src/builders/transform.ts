import type { BuildContext, TransformEntry } from "../types.ts";

import { pathToFileURL } from "node:url";
import { dirname, extname, join, normalize, relative } from "pathe";
import { mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { consola } from "consola";
import { colors as c } from "consola/utils";
import { resolveModulePath, type ResolveOptions } from "exsolve";
import MagicString from "magic-string";
import { fmtPath, removeComments } from "../utils.ts";
import { glob } from "tinyglobby";
import { minifySync, transformSync, parseSync, Visitor } from "rolldown/utils";
import { makeExecutable, SHEBANG_RE } from "./plugins/shebang.ts";

/**
 * Transform all .ts modules in a directory using oxc-transform.
 */
export async function transformDir(ctx: BuildContext, entry: TransformEntry): Promise<void> {
  const entries: Array<[entryName: string, entryPath: string, entryDistPath: string]> = [];
  const outputPaths = new Map<string, string>();
  for (const entryName of await glob("**/*.*", { cwd: entry.input })) {
    if (entry.filter && (await entry.filter(entryName)) === false) {
      continue;
    }
    const entryPath = join(entry.input, entryName);
    const entryDistPath = join(entry.outDir!, entryName.replace(/\.ts$/, ".mjs"));
    entries.push([entryName, entryPath, entryDistPath]);
    outputPaths.set(entryPath, entryDistPath);
  }

  const inputDir = normalize(await realpath(entry.input).catch(() => entry.input));
  const outputPathsByRealPath = new Map<string, string>();
  const resolvedEntries = await Promise.all(
    entries.map(async ([entryName, entryPath, entryDistPath]) => {
      const realEntryPath = normalize(await realpath(entryPath).catch(() => entryPath));
      return [entryName, entryDistPath, realEntryPath] as const;
    }),
  );
  for (const [entryName, entryDistPath, realEntryPath] of resolvedEntries) {
    if (!outputPathsByRealPath.has(realEntryPath) || realEntryPath === join(inputDir, entryName)) {
      outputPathsByRealPath.set(realEntryPath, entryDistPath);
    }
  }

  const findOutputPath = (sourcePath: string) => {
    const normalizedPath = normalize(sourcePath);
    return outputPaths.get(normalizedPath) ?? outputPathsByRealPath.get(normalizedPath);
  };

  const results = await Promise.allSettled(
    entries.map(async ([, entryPath, entryDistPath]) => {
      if (extname(entryPath) === ".ts") {
        const { code, declaration } = await transformModule(
          entryPath,
          entry,
          entryDistPath,
          findOutputPath,
        );
        await mkdir(dirname(entryDistPath), { recursive: true });
        await writeFile(entryDistPath, code, "utf8");
        if (SHEBANG_RE.test(code)) {
          await makeExecutable(entryDistPath);
        }
        if (declaration) {
          await writeFile(entryDistPath.replace(/\.mjs$/, ".d.mts"), declaration, "utf8");
        }
        return entryDistPath;
      }

      await mkdir(dirname(entryDistPath), { recursive: true });
      if (entry.stub) {
        await symlink(entryPath, entryDistPath, "junction").catch(() => {
          /* exists */
        });
      } else {
        const code = await readFile(entryPath, "utf8");
        await writeFile(entryDistPath, code, "utf8");
        if (SHEBANG_RE.test(code)) {
          await makeExecutable(entryDistPath);
        }
      }
      return entryDistPath;
    }),
  );

  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);

  if (errors.length > 0) {
    let isolatedErrors: Error[] = [];
    let otherErrors: Error[] = [];
    for (const error of errors.flatMap((err) => (Array.isArray(err.cause) ? err.cause : [err]))) {
      if (error.message?.includes("--isolatedDeclarations")) {
        isolatedErrors.push(error);
      } else {
        otherErrors.push(error);
      }
    }
    for (const error of otherErrors) {
      consola.error(error);
    }
    for (const error of isolatedErrors) {
      consola.warn(error);
    }
    if (otherErrors.length > 0) {
      throw new Error(`Errors while transforming ${entry.input}`);
    }
  }

  const writtenFiles = results
    .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
    .map((result) => result.value);

  consola.log(
    `\n${c.magenta("[transform] ")}${c.underline(fmtPath(entry.outDir!) + "/")}${entry.stub ? c.dim(" (stub)") : ""}\n${c.dim(itemsTable(writtenFiles.map((f) => fmtPath(f))))}`,
  );
}

function itemsTable(items: string[], consoleWidth: number = process.stdout.columns || 80): string {
  if (items.length === 0) {
    return "";
  }
  const maxItemWidth = Math.max(...items.map((item) => item.length));
  const colWidth = maxItemWidth + 2;
  const columns = Math.max(1, Math.floor(consoleWidth / colWidth));
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    rows.push(row.map((item) => item.padEnd(colWidth)).join(""));
  }
  return rows.join("\n");
}

/**
 * Transform a .ts module using oxc-transform.
 */
async function transformModule(
  entryPath: string,
  entry: TransformEntry,
  entryDistPath: string,
  findOutputPath: (sourcePath: string) => string | undefined,
) {
  const sourceText = await readFile(entryPath, "utf8");

  const sourceOptions = {
    lang: "ts",
    sourceType: "module",
  } as const;

  const parsed = parseSync(entryPath, sourceText, {
    ...sourceOptions,
  });

  if (entry.stub) {
    const hasDefaultExport =
      parsed?.module?.staticExports?.find((exp) =>
        exp.entries.some((e) => e.exportName.kind === "Default"),
      ) !== undefined;
    const relativePath = relative(dirname(entryDistPath), entryPath);
    const code = `export * from "${relativePath}";${
      hasDefaultExport ? `\nexport { default } from "${relativePath}";` : ""
    }`;
    return {
      code,
      declaration: code,
    };
  }

  if (parsed.errors.length > 0) {
    throw new Error(`Errors while parsing ${entryPath}:`, {
      cause: parsed.errors,
    });
  }

  const resolveOptions: ResolveOptions = {
    ...entry.resolve,
    // Keep default results local to this transform so a rebuild sees filesystem changes.
    cache: entry.resolve?.cache ?? new Map<string, unknown>(),
    from: pathToFileURL(entryPath),
    extensions: entry.resolve?.extensions ?? [".ts", ".js", ".mjs", ".cjs", ".json"],
    suffixes: entry.resolve?.suffixes ?? ["", "/index"],
  };

  const magicString = new MagicString(sourceText);
  let declarationString: MagicString | undefined;

  // Rewrite relative imports
  const updatedStarts = new Set<number>();
  const rewriteSpecifier = (
    req: { value: string; start: number; end: number },
    tryResolve = false,
  ) => {
    const moduleId = req.value;
    if (!moduleId.startsWith(".")) {
      return;
    }
    if (updatedStarts.has(req.start)) {
      return; // prevent double rewritings
    }
    updatedStarts.add(req.start);
    // Resolve the path without its URL suffix so extension and index lookup still work.
    const suffixStart = moduleId.search(/[?#]/);
    const pathname = suffixStart === -1 ? moduleId : moduleId.slice(0, suffixStart);
    const suffix = suffixStart === -1 ? "" : moduleId.slice(suffixStart);
    const resolvedAbsolute = tryResolve
      ? resolveModulePath(pathname, { ...resolveOptions, try: true })
      : resolveModulePath(pathname, resolveOptions);
    if (!resolvedAbsolute) {
      return;
    }
    const outputPath = findOutputPath(resolvedAbsolute);
    if (tryResolve && !outputPath) {
      return;
    }
    // Static imports can also target output from another build entry.
    const newPath = outputPath
      ? relative(dirname(entryDistPath), outputPath)
      : relative(dirname(entryPath), resolvedAbsolute.replace(/\.ts$/, ".mjs"));
    const specifier = newPath.startsWith("../") ? newPath : `./${newPath}`;
    const runtimeId = specifier.split("/").map(encodeURIComponent).join("/") + suffix;
    const declarationId = specifier + suffix;
    if (runtimeId !== declarationId) {
      declarationString ??= magicString.clone();
    }
    magicString.overwrite(req.start, req.end, JSON.stringify(runtimeId));
    declarationString?.overwrite(req.start, req.end, JSON.stringify(declarationId));
  };

  for (const staticImport of parsed.module.staticImports) {
    rewriteSpecifier(staticImport.moduleRequest);
  }

  for (const staticExport of parsed.module.staticExports) {
    for (const staticExportEntry of staticExport.entries) {
      if (staticExportEntry.moduleRequest) {
        rewriteSpecifier(staticExportEntry.moduleRequest);
      }
    }
  }

  if (parsed.module.dynamicImports.length > 0 || sourceText.includes("import")) {
    new Visitor({
      ImportExpression(node) {
        let source = node.source;
        while (
          source.type === "ParenthesizedExpression" ||
          source.type === "TSAsExpression" ||
          source.type === "TSSatisfiesExpression" ||
          source.type === "TSTypeAssertion"
        ) {
          source = source.expression;
        }
        if (source.type === "Literal" && typeof source.value === "string") {
          rewriteSpecifier({ value: source.value, start: source.start, end: source.end }, true);
        } else if (source.type === "TemplateLiteral" && source.expressions.length === 0) {
          const cooked = source.quasis[0]?.value.cooked;
          if (cooked !== null && cooked !== undefined) {
            rewriteSpecifier({ value: cooked, start: source.start, end: source.end }, true);
          }
        }
      },
      TSImportType(node) {
        rewriteSpecifier(node.source, true);
      },
    }).visit(parsed.program);
  }

  const runtimeSource = magicString.toString();
  const declarationSource = declarationString?.toString() ?? runtimeSource;

  let emitDeclaration = entry.dts ?? true;
  if (typeof emitDeclaration === "function") {
    emitDeclaration = await emitDeclaration(entryPath);
  }

  const runTransform = (declaration: boolean) =>
    transformSync(entryPath, declaration ? declarationSource : runtimeSource, {
      ...entry.oxc,
      ...sourceOptions,
      cwd: dirname(entryPath),
      typescript: {
        ...entry.oxc?.typescript,
        declaration: declaration ? { stripInternal: true } : undefined,
      },
    });

  let transformed = runTransform(!!emitDeclaration);

  // If the only failures are isolated-declaration parse errors, retry without
  // declaration emit so the .mjs is still written. Without this, a single
  // un-inferable type drops the whole file from dist while the build reports
  // success — see https://github.com/unjs/obuild/issues/82.
  if (
    emitDeclaration &&
    transformed.errors.length > 0 &&
    transformed.errors.every((err) => err.message?.includes("--isolatedDeclarations"))
  ) {
    for (const err of transformed.errors) {
      consola.warn(err);
    }
    consola.warn(
      `[obuild] declaration emit skipped for ${fmtPath(entryPath)} (--isolatedDeclarations); .mjs still emitted, .d.mts missing`,
    );
    transformed = runTransform(false);
  } else if (emitDeclaration && declarationString && transformed.errors.length === 0) {
    // Node resolves module URLs, while TypeScript resolves literal paths in declarations.
    const { declaration, warnings } = transformed;
    transformed = { ...runTransform(false), declaration, warnings };
  }

  if (transformed.warnings.length > 0) {
    for (const warning of transformed.warnings) {
      consola.warn(warning);
    }
  }

  if (transformed.errors.length > 0) {
    if (transformed.errors.length === 1) {
      throw transformed.errors[0];
    }
    throw new Error(`Errors while transforming ${entryPath}`, {
      cause: transformed.errors,
    });
  }

  if (entry.minify) {
    const res = minifySync(entryPath, transformed.code, entry.minify === true ? {} : entry.minify);
    transformed.code = res.code;
    transformed.map = res.map;
  }

  transformed.code = removeComments(transformed.code);

  return transformed;
}

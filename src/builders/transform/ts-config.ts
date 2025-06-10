import path from "pathe";
import consola from "consola";
import { defu } from "defu";
import { getTsconfig } from "get-tsconfig";
import { normalizePath } from "../../utils.ts";

import type { TSConfig } from "pkg-types";
import type { BuildContext, TransformEntry } from "../../types.ts";

/**
 * Resolve the TypeScript configuration for a transform entry.
 *
 * The `rootDir` is set to the directory of the `tsconfig.json` file if it exists, otherwise it defaults to the package directory.
 * All paths in the TypeScript configuration are rewritten to be absolute paths.
 *
 * @param entry - The transform entry containing the declaration options.
 * @param context - Build context
 * @returns The TypeScript configuration.
 */
export function resolveTSConfig(
  entry: TransformEntry,
  context: BuildContext,
): TSConfig {
  // Read the TypeScript configuration from tsconfig.json
  const tsConfigResult = getTsconfig(context.pkgDir);

  if (tsConfigResult === null) {
    consola.warn(`tsconfig.json not found in ${context.pkgDir}`);
  }

  const packageTsConfig: TSConfig =
    tsConfigResult === null
      ? {}
      : rewriteTSConfigPaths(
          tsConfigResult.config,
          // Use the directory of the tsconfig.json file as the base path
          (p: string) => normalizePath(p, path.dirname(tsConfigResult.path)),
        );

  const dtsOptions = typeof entry.dts === "object" ? entry.dts : {};
  const optionsTsConfig: TSConfig =
    dtsOptions?.typescript === undefined
      ? {}
      : rewriteTSConfigPaths(
          dtsOptions.typescript,
          // Use the package directory as the base path for user provided options
          (p: string) => normalizePath(p, context.pkgDir),
        );

  // Override the TypeScript configuration with the entry's declaration options
  const tsConfig: TSConfig = defu(optionsTsConfig, packageTsConfig);

  // Ensure the TypeScript configuration has the necessary defaults
  tsConfig.compilerOptions = defu(
    {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
    } satisfies TSConfig["compilerOptions"],
    tsConfig.compilerOptions,
    {
      allowJs: true,
      skipLibCheck: true,
      stripInternal: true,
      strictNullChecks: true,
      allowImportingTsExtensions: true,
    } satisfies TSConfig["compilerOptions"],
  );

  const { compilerOptions } = tsConfig;

  // By default the rootDir is the directory of the tsconfig.json file
  const defaultRootDir = tsConfigResult?.path
    ? path.dirname(tsConfigResult.path)
    : context.pkgDir;

  compilerOptions.rootDir =
    compilerOptions?.rootDir === undefined
      ? defaultRootDir
      : normalizePath(compilerOptions.rootDir, defaultRootDir);

  return tsConfig;
}

/**
 * Creates a new TypeScript configuration with rewritten paths.
 *
 * @param tsConfig - TypeScript configuration
 * @param rewrite - Rewrite function to apply to each path
 * @returns A new TypeScript configuration with rewritten paths
 */
export function rewriteTSConfigPaths(
  tsConfig: TSConfig,
  rewrite: (path: string) => string,
): TSConfig {
  const { compilerOptions } = tsConfig;

  if (
    compilerOptions?.paths === undefined ||
    typeof compilerOptions.paths !== "object"
  ) {
    return { ...tsConfig };
  }

  const newPaths: Record<string, string[]> = {};
  for (const key in compilerOptions.paths) {
    const value = compilerOptions.paths[key];
    newPaths[key] = Array.isArray(value)
      ? value.map((path) => rewrite(path))
      : [rewrite(value)];
  }

  return {
    ...tsConfig,
    compilerOptions: {
      ...compilerOptions,
      paths: newPaths,
    },
  };
}

import type { InputFile, OutputFile } from "./files.ts";
import type { TsConfigJsonResolved as TSConfig } from "get-tsconfig";

/**
 * Temporary storage for the plugin to store any data it needs during the build
 * process.
 */
export type PluginStorage = Record<string, any>;

/** Plugin context that provides information about the current build and project. */
export interface PluginContext<TStorage extends PluginStorage = PluginStorage> {
  /** Package JSON of the project. */
  pkg: { name: string } & Record<string, unknown>;

  /** Directory of the package. */
  pkgDir: string;

  /** Directory containing the input files to process. */
  inputDir: string;

  /** TypeScript configuration for the project. */
  tsConfig?: TSConfig;

  /**
   * Temporary storage for the plugin to store any data it needs during the
   * build process.
   *
   * It's contents are not persisted between builds and should be used for
   * temporary data that does not need to be saved.
   */
  storage: TStorage;

  /**
   * Function to transform an input file.
   *
   * @param inputFile - The input file to transform.
   * @returns An array of output files or an array the raw file when no
   *   transformation was applied.
   */
  transform: (inputFile: InputFile) => OutputFile[] | Promise<OutputFile[]>;

  /**
   * Synchronously resolves a module then converts it to a file path.
   *
   * @param moduleId - The identifier or path of the module to resolve.
   * @param fromPath - The path from which to resolve the module.
   * @returns The resolved URL as a string.
   * @throws {Error} If the resolved path is not a file URL.
   */
  resolveModulePath(moduleId: string, fromPath: string): string;
}

/** Context provided to the plugin during initialization. */
export type InitialPluginContext = Omit<PluginContext, "transform" | "storage">;

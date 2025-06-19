import type { PluginHooks } from "./hooks.ts";
import type { InputFile, OutputFile } from "./files.ts";
import type {
  InitialPluginContext,
  PluginContext,
  PluginStorage,
} from "./context.ts";

type TransformResult = OutputFile[] | void;

/**
 * Represents a plugin that can transform input files and process output files.
 * Plugins can implement hooks to extend the build process.
 */
export interface Plugin<TStorage extends PluginStorage = any>
  extends PluginHooks<PluginContext<TStorage>> {
  /** Unique name of the plugin. */
  name: string;

  /** Initialization function for the plugin. This function is called once. */
  initialize?: (
    context: InitialPluginContext,
  ) => void | PluginStorage | Promise<void | PluginStorage>;

  /**
   * Function type for a plugin that transforms an input file and returns an
   * array of output files.
   *
   * @param file - The file to transform.
   * @param context - Plugin context
   * @returns An array of output files or undefined if the transform is not
   *   applicable.
   */
  transform?: (
    file: InputFile,
    context: PluginContext<TStorage>,
  ) => TransformResult | Promise<TransformResult>;
}

interface PluginWithStorage<TStorage extends PluginStorage>
  extends Plugin<TStorage> {
  /**
   * Initialization function for the plugin. This function is called once. The
   * returned value is the storage object that will be used by the plugin.
   */
  initialize: (context: InitialPluginContext) => TStorage | Promise<TStorage>;
}

/**
 * Type for a function that creates a plugin instance with optional
 * configuration.
 *
 * @param options - Optional configuration for the plugin.
 * @returns Plugin instance that can be used in the build process.
 */
export type PluginFactory<
  TOptions extends object = object,
  TStorage extends PluginStorage | void = void,
> = (
  options?: TOptions,
) => TStorage extends PluginStorage ? PluginWithStorage<TStorage> : Plugin;

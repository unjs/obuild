import { pathToFileURL } from "node:url";
import { resolveModulePath } from "exsolve";
import { sortOutputFiles } from "./output.ts";
import { oxcDts } from "@obuild/plugin-oxc-dts";
import { oxcTransform } from "@obuild/plugin-oxc-transform";
import { oxcMinify } from "@obuild/plugin-oxc-minify";

import type { ResolveOptions } from "exsolve";
import type {
  BuildContext,
  DefaultTransformEntry,
  TransformEntry,
} from "../../types.ts";
import type {
  CallPluginHook,
  InitialPluginContext,
  InputFile,
  OutputFile,
  Plugin,
  PluginContext,
  PluginStorage,
} from "./plugins/index.ts";

type TransformResult<T extends boolean = false> = T extends true
  ? OutputFile[] | undefined
  : OutputFile[];

export type Transformer = {
  /**
   * Calls a plugin hook with the specified name and arguments.
   */
  callHook: CallPluginHook;

  /**
   * Transforms an input file using the specified plugins.
   *
   * @param file - The input file to transform.
   * @returns An array of output files or raw output if no plugins were applied.
   */
  transform: (file: InputFile) => TransformResult | Promise<TransformResult>;
};

export type TransformerOptions = BuildContext & {
  /**
   * Directory containing the input files to process.
   */
  entry: TransformEntry;
};

function resolvePlugins(entry: TransformEntry): Plugin[] {
  if (entry.plugins !== undefined) {
    if (entry.oxc !== undefined) {
      throw new TypeError(
        "The `oxc` and `plugins` options can't be used together in an entry.",
      );
    }

    return entry.plugins as Plugin[];
  }

  const { oxc } = entry as DefaultTransformEntry;
  const plugins: Plugin[] = [];

  if (oxc?.dts !== false) {
    plugins.push(
      oxcDts({
        declarations: oxc?.dts,
      }),
    );
  }

  if (oxc?.transform !== false) {
    plugins.push(oxcTransform({ transform: oxc?.transform }));
  }

  if (oxc?.minify) {
    plugins.push(oxcMinify({ minify: oxc?.minify }));
  }

  return plugins;
}

const defaultResolveOptions: ResolveOptions = {
  extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"],
  suffixes: ["", "/index"],
};

/*
 * Creates a transformer function that can process input files using specified transformers.
 *
 * @param options - Configuration options for the transformer.
 * @returns A Tramsformer object.
 */
export async function createTransformer(
  options: TransformerOptions,
): Promise<Transformer> {
  const { entry } = options;
  const pluginStorages = new Map<Plugin, PluginStorage>();
  const resolvedPlugins = resolvePlugins(entry);

  const initialPluginContext: InitialPluginContext = {
    pkg: options.pkg,
    pkgDir: options.pkgDir,
    inputDir: entry.input,
    tsConfig: entry.tsConfig,
    resolveModulePath(moduleId, fromPath) {
      return resolveModulePath(moduleId, {
        ...entry.resolve,
        // Don't merge these with the defaults
        extensions:
          entry.resolve?.extensions ?? defaultResolveOptions.extensions,
        suffixes: entry.resolve?.suffixes ?? defaultResolveOptions.suffixes,
        from: pathToFileURL(fromPath),
      });
    },
  };

  // Initialize storage for each plugin
  for (const plugin of resolvedPlugins) {
    if (typeof plugin["initialize"] !== "function") {
      pluginStorages.set(plugin, {});
      continue;
    }

    const storage = await plugin.initialize(initialPluginContext);
    pluginStorages.set(plugin, storage || {});
  }

  /**
   * Calls a plugin hook with the specified name and arguments.
   *
   * @param name -  The name of the plugin hook to call.
   * @param args  - Arguments to pass to the plugin hook.
   */
  const callHook: CallPluginHook = async (name, ...args) => {
    const hookPluginContext: Omit<PluginContext, "storage"> = {
      ...initialPluginContext,
      transform: (file) =>
        transform(
          file,
          resolvedPlugins,
          true, // Pipeline disabled for the context
        ),
    };

    for (const plugin of resolvedPlugins) {
      if (typeof plugin[name] !== "function") {
        continue;
      }

      const hook = plugin[name];
      const pluginContext: PluginContext = {
        ...hookPluginContext,
        storage: pluginStorages.get(plugin) || {},
      };

      await hook.call(plugin, pluginContext, ...args);
    }
  };

  const transformPlugins = resolvedPlugins.filter(
    (plugin) => plugin.transform !== undefined,
  );

  /**
   * Transforms an input file using the specified plugins.
   *
   * @param inputFile -  The input file to transform.
   * @param plugins  - List of plugins to apply for transformation.
   * @param noPipeline - Disables the pipeline for the transformation.
   * @param noRawOutput - Disables raw output if further transformations are applied.
   * @returns An array of output files or raw output if no plugins were applied. If `noPipeline` is true, it returns undefined if no plugins were applied.
   */
  const transform = async <T extends boolean = false>(
    inputFile: InputFile,
    plugins: Plugin[] = transformPlugins,
    noPipeline?: boolean,
    noRawOutput?: T,
  ): Promise<TransformResult<T>> => {
    for (let i = 0; i < plugins.length; i++) {
      const plugin = plugins[i];
      const nextPlugins = plugins.slice(i + 1);

      const pluginContext: PluginContext = {
        ...initialPluginContext,
        storage: pluginStorages.get(plugin) || {},
        transform: (file) =>
          transform(
            file,
            resolvedPlugins,
            true, // Pipeline disabled for the context
          ),
      };

      const outputFiles = await plugin.transform?.(inputFile, pluginContext);

      if (outputFiles !== undefined && Array.isArray(outputFiles)) {
        sortOutputFiles(outputFiles);

        if (noPipeline === true || nextPlugins.length === 0) {
          return outputFiles;
        }

        const innerOutputFiles: OutputFile[] = [];

        for (const outputFile of outputFiles) {
          if (outputFile.skip === true) {
            innerOutputFiles.push(outputFile);

            continue;
          }

          const result = await transform(
            { ...outputFile } as InputFile,
            nextPlugins, // Next plugins to apply
            false, // Pipeline enabled
            true, // No raw output if further transformations are applied
          );

          if (result === undefined || !Array.isArray(result)) {
            innerOutputFiles.push(outputFile);

            continue;
          }

          innerOutputFiles.push(...result);
        }

        return innerOutputFiles;
      }
    }

    if (noRawOutput === true) {
      return undefined as TransformResult<T>;
    }

    return [
      {
        type: "raw",
        path: inputFile.path,
        srcPath: inputFile.srcPath,
        extension: inputFile.extension,
      },
    ];
  };

  return {
    callHook,
    transform,
  };
}

import type {
  InputOptions,
  MinifyOptions,
  OutputOptions,
  RolldownBuild,
  RolldownPluginOption,
} from "rolldown";

import type { ResolveOptions } from "exsolve";
import type { Options as DtsOptions } from "rolldown-plugin-dts";
import type { OxcDtsPluginOptions } from "@obuild/plugin-oxc-dts";
import type { OxcMinifyPluginOptions } from "@obuild/plugin-oxc-minify";
import type { OxcTransformPluginOptions } from "@obuild/plugin-oxc-transform";
import type { Plugin } from "./builders/transform/plugins/index.ts";
import type { TsConfigJsonResolved as TSConfig } from "get-tsconfig";

export interface BuildContext {
  pkgDir: string;
  pkg: { name: string } & Record<string, unknown>;
}

export type _BuildEntry = {
  /**
   * Output directory relative to project root.
   *
   * Defaults to `dist/` if not provided.
   */
  outDir?: string;

  /**
   * Avoid actual build but instead link to the source files.
   */
  stub?: boolean;
};

export type BundleEntry = _BuildEntry & {
  type: "bundle";

  /**
   * Entry point(s) to bundle relative to the project root.
   * */
  input: string | string[];

  /**
   * Minify the output using rolldown.
   *
   * Defaults to `false` if not provided.
   */
  minify?: boolean | "dce-only" | MinifyOptions;

  /**
   * Options passed to rolldown.
   *
   * See [rolldown config options](https://rolldown.rs/reference/config-options) for more details.
   */
  rolldown?: InputOptions & { plugins?: RolldownPluginOption[] };

  /**
   * Declaration generation options.
   * Options are inferred from the `tsconfig.json` file if available.
   *
   * See [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts) for more details.
   *
   * Set to `false` to disable.
   */
  dts?: boolean | DtsOptions;
};

type _TransformEntry = _BuildEntry & {
  type: "transform";

  /**
   * Directory to transform relative to the project root.
   */
  input: string;

  /**
   * Source map directory relative to project root.
   *
   * Defaults to `outDir` if not provided.
   */
  mapDir?: string;

  /**
   * Options passed to exsolve for module resolution.
   *
   * See [exsolve](https://github.com/unjs/exsolve) for more details.
   */
  resolve?: Omit<ResolveOptions, "from">;

  /**
   * TypeScript configuration for the entry.
   * Options are inferred from the `tsconfig.json` file if available.
   *
   * See [tsconfig.json](https://www.typescriptlang.org/tsconfig) for more details.
   */
  tsConfig?: TSConfig;
};

export type DefaultTransformEntry = _TransformEntry & {
  /**
   * Using custom plugins is not allowed when `oxc` options are provided.
   * You should remove the `oxc` options and pass them to the added plugins directly.
   */
  plugins?: "You can only use custom plugins when `oxc` option is not defined.";

  oxc?: {
    /**
     * Options passed to oxc-transform.
     *
     * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
     */
    transform?: false | OxcTransformPluginOptions["transform"];

    /**
     * Minify the output using oxc-minify.
     *
     * Defaults to `false` if not provided.
     */
    minify?: false | OxcMinifyPluginOptions["minify"];

    /**
     * Isolated declarations options.
     *
     * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
     */
    dts?: false | OxcDtsPluginOptions["declarations"];
  };
};

type CustomTransformEntry = _TransformEntry & {
  /**
   * List of pluginss to use for the transformation.
   * The plugins will be applied in the order they are defined.
   */
  plugins?: Plugin[];

  /**
   * Options for the default plugins are not allowed when custom `plugins` are used.
   * You can pass the desired options for these to the added plugins directly.
   */
  oxc?: "You can only set settings for `oxc` when `plugins` option is not defined.";
};

export type TransformEntry = DefaultTransformEntry | CustomTransformEntry;
export type BuildEntry = BundleEntry | TransformEntry;

export interface BuildHooks {
  start?: (ctx: BuildContext) => void | Promise<void>;
  end?: (ctx: BuildContext) => void | Promise<void>;
  entries?: (entries: BuildEntry[], ctx: BuildContext) => void | Promise<void>;
  rolldownConfig?: (
    cfg: InputOptions,
    ctx: BuildContext,
  ) => void | Promise<void>;
  rolldownOutput?: (
    cfg: OutputOptions,
    res: RolldownBuild,
    ctx: BuildContext,
  ) => void | Promise<void>;
}

export interface BuildConfig {
  cwd?: string | URL;
  entries?: (BuildEntry | string)[];
  hooks?: BuildHooks;
}

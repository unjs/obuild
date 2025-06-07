import type {
  InputOptions,
  MinifyOptions,
  OutputOptions,
  RolldownBuild,
  RolldownPluginOption,
} from "rolldown";

import type { PackageJson } from "pkg-types";
import type { Options as BundleDtsOptions } from "rolldown-plugin-dts";
import type { TransformDtsOptions } from "./declarations/index.ts";
import type {
  Transformer,
  TransformerName,
  TransformerOptions,
} from "./transformers/types.ts";

export interface BuildContext {
  pkgDir: string;
  pkg: PackageJson;
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
   *
   * See [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts) for more details.
   *
   * Options are inferred from the `tsconfig.json` file if available.
   *
   * Set to `false` to disable.
   */
  dts?: boolean | BundleDtsOptions;
};

export type TransformEntry = _BuildEntry & {
  type: "transform";

  /**
   * Directory to transform relative to the project root.
   */
  input: string;

  /**
   * List of transformers to invoke.
   */
  transformers?: Array<TransformerName | Transformer>;

  /**
   * Source map directory relative to project root.
   *
   * Defaults to `outDir` if not provided.
   */
  mapDir?: string;

  /**
   * Options for the `oxc` transformer.
   */
  oxc?: TransformerOptions["oxc"];

  /**
   * Options for the `vue` transformer.
   */
  vue?: TransformerOptions["vue"];

  /**
   * Options for the `postcss` transformer.
   */
  postcss?: TransformerOptions["postcss"];

  /**
   * Declaration generation options.
   *
   * Set to `false` to disable declaration generation, or provide options to customize it.
   */
  dts?: boolean | TransformDtsOptions;
};

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

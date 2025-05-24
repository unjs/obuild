import type {
  InputOptions,
  MinifyOptions,
  OutputOptions,
  RolldownBuild,
} from "rolldown";

import type { IsolatedDeclarationsOptions } from "oxc-transform";

import type { MinifyOptions as OXCMinifyOptions } from "oxc-minify";

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
   * Generate and bundle dts files via rolldown-plugin-dts.
   *
   * Set to `false` to disable.
   */
  declaration?: boolean | IsolatedDeclarationsOptions;
};

export type TransformEntry = _BuildEntry & {
  type: "transform";

  /**
   * Directory to transform relative to the project root.
   */
  input: string;

  /**
   * Minify the output using oxc-minify.
   *
   * Defaults to `false` if not provided.
   */
  minify?: boolean | OXCMinifyOptions;

  /**
   * Generate and bundle dts files via rolldown-plugin-dts.
   *
   * Set to `false` to disable.
   */
  declaration?: boolean | IsolatedDeclarationsOptions;
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
  entries?: (BuildEntry | string)[];
  hooks?: BuildHooks;
}

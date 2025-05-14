import type { InputOptions, OutputOptions, RolldownBuild } from "rolldown";
import type { IsolatedDeclarationsOptions } from "oxc-transform";

export interface BuildContext {
  pkgDir: string;
  pkg: { name: string } & Record<string, unknown>;
}

export type BundleEntry = {
  type: "bundle";

  /**
   * Entry point(s) to bundle relative to the project root.
   * */
  input: string | string[];

  /**
   * Output directory relative to project root.
   *
   * Defaults to `dist/` if not provided.
   */
  outDir?: string;

  /**
   * Minify the output via oxc-minify.
   *
   * Defaults `false` if not provided.
   */
  minify?: boolean;

  /**
   * Generate and bundle dts files via rolldown-plugin-dts.
   *
   * Set to `false` to disable.
   */
  declaration?: boolean | IsolatedDeclarationsOptions;
};

export type TransformEntry = {
  type: "transform";

  /**
   * Directory to transform relative to the project root.
   */
  input: string;

  /**
   * Output directory relative to project root.
   *
   * Defaults to `dist/` if not provided.
   */
  outDir?: string;

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

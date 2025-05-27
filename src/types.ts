import type {
  InputOptions,
  MinifyOptions,
  OutputOptions,
  RolldownBuild,
} from "rolldown";

import type { Options as DtsOptions } from "rolldown-plugin-dts";
import type { TransformOptions } from "oxc-transform";
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
   * Declaration generation options.
   *
   * See [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts) for more details.
   *
   * Options are inferred from the `tsconfig.json` file if available.
   *
   * Set to `false` to disable.
   */
  dts?: boolean | DtsOptions;

  /**
   * Options passed to oxc-transform.
   *
   * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
   */
  oxc?: TransformOptions;
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

import type {
  InputOptions,
  MinifyOptions,
  OutputOptions,
  RolldownBuild,
  RolldownPluginOption,
} from "rolldown";

import type { Options as DtsOptions } from "rolldown-plugin-dts";
import type { ExternalsTraceOptions } from "nf3";
import type { ResolveOptions } from "exsolve";
import type { TransformOptions, MinifyOptions as OXCMinifyOptions } from "rolldown/utils";

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
   * Minify only bundled dependency chunks (`_chunks/libs/*`), keeping your own code readable.
   *
   * Set to `true` to minify all bundled dependencies, or pass a list of package names to only minify those.
   *
   * Has no effect when `minify` is enabled (everything is already minified).
   *
   * @example
   * ```ts
   * minifyLibs: ["zod", "@scope/pkg"]
   * ```
   */
  minifyLibs?: boolean | string[];

  /**
   * Compress bundled dependency chunks (`_chunks/libs/*`) into self-extracting ES modules to reduce disk size.
   *
   * Import/export statements are preserved; the rest of the chunk is compressed and inlined as a base122 string,
   * then evaluated at load time (adds ~20ms per 2MB of minified code to a cold import).
   *
   * Set to `true` to compress all bundled dependencies, pass a list of package names to only compress those,
   * or pass options (see {@link CompressLibsOptions}). Combine with `minifyLibs` for the smallest output.
   *
   * Caveats: compressed chunks rely on `new Function` (blocked by CSP without `unsafe-eval`), export snapshots
   * instead of live bindings, have no sourcemaps and do not benefit from `NODE_COMPILE_CACHE`.
   *
   * @example
   * ```ts
   * compressLibs: ["undici"]
   * compressLibs: { algorithm: "deflate" } // browser compatible
   * ```
   */
  compressLibs?: boolean | string[] | CompressLibsOptions;

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
  dts?: boolean | DtsOptions;

  /**
   * Configure third-party licenses file emission.
   *
   * By default, a gzipped `THIRD-PARTY-LICENSES.md.gz` file is emitted to `outDir`.
   *
   * Set to `false` to disable.
   *
   * Set `gzip: false` to emit a plain `THIRD-PARTY-LICENSES.md` file instead.
   */
  license?: false | { gzip?: boolean };

  /**
   * Package names to trace with [nf3](https://github.com/unjs/nf3) instead of bundling.
   *
   * Listed packages (and their subpath imports) are kept as external imports, and only the files
   * actually required at runtime are copied into `<outDir>/node_modules` (tree-shaken and deduplicated).
   * All other `node_modules` imports are bundled as usual.
   *
   * Pass an object to also customize nf3 trace options (`hooks`, `transform`, `fullTraceInclude`, `traceInclude`, ...).
   *
   * @example
   * ```ts
   * trace: ["youch", "cookie-es"]
   * ```
   */
  trace?: string[] | TraceOptions;
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
   * Options passed to oxc-transform.
   *
   * See [oxc-transform](https://www.npmjs.com/package/oxc-transform) for more details.
   */
  oxc?: TransformOptions;

  /**
   * Options passed to exsolve for module resolution.
   *
   * See [exsolve](https://github.com/unjs/exsolve) for more details.
   */
  resolve?: Omit<ResolveOptions, "from">;

  /**
   * A filter function to exclude files from being transformed.
   */
  filter?: (filePath: string) => boolean | Promise<boolean>;

  /**
   * If sets to `false`, or if the function returns `false`, declaration files won't be emitted for the module.
   */
  dts?: boolean | ((filePath: string) => boolean | Promise<boolean>);
};

export type TraceOptions = ExternalsTraceOptions & {
  /**
   * Package names to externalize and trace.
   */
  include: string[];
};

export type CompressLibsOptions = {
  /**
   * Package names to compress. Defaults to all bundled dependencies.
   */
  include?: string[];

  /**
   * Compression algorithm.
   *
   * - `"brotli"` (default): smallest output (~28% of minified size). Node.js only (static `node:zlib`
   *   import, no browser fallback), no top-level await, so chunks stay loadable with `require(esm)`.
   * - `"deflate"`: ~25% larger than brotli (~35% of minified size), but works everywhere. Node.js inflates
   *   synchronously via `process.getBuiltinModule("node:zlib")`, other runtimes (browsers) use
   *   `DecompressionStream` with top-level await, which makes chunks unloadable with `require(esm)`.
   */
  algorithm?: "deflate" | "brotli";

  /**
   * Compression level: `0-9` for deflate (default `9`), `0-11` for brotli (default `11`).
   *
   * Lower brotli levels build much faster (`9` is ~20x faster than `11`) for ~9% larger output.
   */
  level?: number;
};

export type BuildEntry = BundleEntry | TransformEntry;

export interface BuildHooks {
  start?: (ctx: BuildContext) => void | Promise<void>;
  end?: (ctx: BuildContext) => void | Promise<void>;
  entries?: (entries: BuildEntry[], ctx: BuildContext) => void | Promise<void>;
  rolldownConfig?: (cfg: InputOptions, ctx: BuildContext) => void | Promise<void>;
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

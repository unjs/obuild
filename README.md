# 📦 obuild 😯

✅ Zero-config ESM/TS package builder powered by [**rolldown**](https://rolldown.rs/).

## Used by

- [📦 obuild](https://github.com/unjs/obuild/)
- [🌳 rou3](https://github.com/h3js/rou3/)
- [💥 srvx](https://github.com/h3js/srvx)
- [🕊️ unenv](https://github.com/unjs/unenv)
- [🕰️ omnichron](https://github.com/oritwoen/omnichron)
- [⚙️ c12](https://github.com/unjs/c12)
- [...add yours...]

## Usage

### CLI

```sh
# bundle
npx obuild ./src/index.ts

# transform
npx obuild ./src/runtime/:./dist/runtime
```

You can use `--dir` to set the working directory.

If paths end with `/`, obuild uses transpile mode using [oxc-transform](https://www.npmjs.com/package/oxc-transform) instead of bundle mode with [rolldown](https://rolldown.rs/).

### Programmatic

```js
import { build } from "obuild";

await build({
  cwd: ".",
  entries: ["./src/index.ts"],
});
```

## Config

You can use `build.config.mjs` (or `.ts`) or pass config to `build()` function.

```js
import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts"],
      // outDir: "./dist",
      // minify: false,
      // stub: false,
      // rolldown: {}, // https://rolldown.rs/reference/config-options
      // dts: {}, // https://github.com/sxzz/rolldown-plugin-dts#options
      // license: { gzip: true }, // emit `THIRD-PARTY-LICENSES.md.gz` (set `false` to disable)
      // trace: ["some-dep"], // trace listed deps with nf3 instead of bundling (see below)
    },
    {
      type: "transform",
      input: "./src/runtime",
      outDir: "./dist/runtime",
      // minify: false,
      // stub: false,
      // oxc: {},
      // resolve: {}
    },
  ],
  hooks: {
    // start: (ctx) => {},
    // end: (ctx) => {},
    // entries: (entries, ctx) => {},
    // rolldownConfig: (config, ctx) => {},
    // rolldownOutput: (output, res, ctx) => {},
  },
});
```

## Dependency Tracing

Some `node_modules` dependencies cannot be bundled reliably (native bindings, relative file access, dynamic requires, ...).

Set `trace` on a bundle entry to a list of package names to opt them out of bundling via [nf3](https://github.com/unjs/nf3): listed packages (including subpath imports) are kept as external imports, and only the files actually required at runtime are copied into `<outDir>/node_modules` (tree-shaken and deduplicated). All other `node_modules` imports are bundled as usual.

```js
export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts"],
      trace: ["youch", "cookie-es"],
    },
  ],
});
```

Pass an object to also customize [nf3 trace options](https://github.com/unjs/nf3#hooks):

```js
trace: {
  include: ["youch", "cookie-es"],
  // traceInclude: ["some-native-dep"], // force trace even if not statically imported
  // fullTraceInclude: ["pkg-with-assets"], // copy all files of a package
  // transform: [{ filter: (id) => /\.m?js$/.test(id), handler: (code, id) => minify(id, code).code }],
  // hooks: { tracedPackages: (pkgs) => {} },
}
```

## Bytes and Text Imports

Bundle entries support the [import bytes](https://github.com/tc39/proposal-import-bytes) and [import text](https://github.com/tc39/proposal-import-text) proposals. Files imported with a `bytes` or `text` type attribute are inlined into the bundle as a `Uint8Array` or a string, regardless of their extension:

```ts
import wasm from "./lib.wasm" with { type: "bytes" }; // Uint8Array
import readme from "../README.md" with { type: "text" }; // string

const { default: template } = await import("./template.html", { with: { type: "text" } });
```

Generated `.d.mts` files type these as `Uint8Array` and `string`. TypeScript itself does not implement the proposals yet, so the importing source needs a `// @ts-expect-error` comment (or a module declaration) until it does.

## Stub Mode

When working on a package locally, it can be tedious to rebuild or run the watch command every time.

You can use `stub: true` (per entry config) or the `--stub` CLI flag. In this mode, obuild skips the actual build and instead links the expected dist paths to the source files.

- For bundle entries, `.mjs` and `.d.mts` files re-export the source file.
- For transpile entries, src dir is symlinked to dist.

**Caveats:**

- You need a runtime that natively supports TypeScript. Deno, Bun, Vite, and Node.js (1)
- For transpile mode, you need to configure your bundler to resolve either `.ts` or `.mjs` extensions.
- For bundle mode, if you add a new entry or add/remove a `default` export, you need to run the stub build again.

(1) For Node.js, you have several options:

- Using `node --experimental-strip-types` (Available in [22.6](https://nodejs.org/en/blog/release/v22.6.0))
- Using [jiti](https://github.com/unjs/jiti) (`node --import jiti/register`)
- Using [oxc-node](https://github.com/oxc-project/oxc-node) (`node --import @oxc-node/core/register`)
- Using [unloader](https://github.com/sxzz/unloader) (`node --import unloader/register`)

## Prior Arts

- [unbuild](https://github.com/unjs/unbuild): Stable solution based on rollup and [mkdist](https://github.com/unjs/mkdist).
- [tsdown](https://tsdown.dev/): Alternative bundler based on rolldown.

## License

💛 Released under the [MIT](./LICENSE) license.

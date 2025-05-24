# 📦 obuild 😯

✅ Zero-config ESM/TS package builder.

Powered by [**oxc**](https://oxc.rs/), [**rolldown**](https://rolldown.rs/) and [**rolldown-plugin-dts**](https://github.com/sxzz/rolldown-plugin-dts).

The **obuild** project aims to be the next-generation successor to the current [unbuild](https://github.com/unjs/unbuild).

- 🌱 Fresh rewrite with cleanups and removal of legacy features.
- 🚀 Uses [**oxc**](https://oxc.rs/) and [**rolldown**](https://rolldown.rs/) instead of rollup and mkdist.
- 👌 Strict ESM-compliant imports with explicit extensions.
- 🔒 Types are built with isolated declaration constraints.
- 🪦 No support for CommonJS output.

Some differences are not easy to adopt. Developing as a standalone project allows for faster progress and dogfooding in real projects.

👀 See [this issue](https://github.com/unjs/obuild/issues/24) for more explanation about the difference between `obuild`, `unbuild`, `tsup`, and `tsdown`.

## Currently used by

- [📦 obuild](https://github.com/unjs/obuild/)
- [🌳 rou3](https://github.com/h3js/rou3/)
- [💥 srvx](https://github.com/h3js/srvx)
- [🕊️ unenv](https://github.com/unjs/unenv)
- [🕰️ omnichron](https://github.com/oritwoen/omnichron)
- [...add yours...]

## Usage

**CLI:**

```sh
# bundle
npx obuild ./src/index.ts

# transform
npx obuild ./src/runtime/:./dist/runtime
```

You can use `--dir` to set the working directory.

**Programmatic:**

```js
import { build } from "obuild";

await build(".", ["./src/index.ts"]);
```

> [!NOTE]
> Auto entries inference similar to unbuild coming soon ([#4](https://github.com/unjs/obuild/issues/4)).

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

## Proof of concept

> [!IMPORTANT]
>
> This is a proof-of-concept project.
>
> Features are incomplete, and output behavior may change between versions.
>
> Feedback and contributions are very welcome! If you'd like to make changes with more than a few lines of code, please open an issue first to discuss.

## License

💛 Released under the [MIT](./LICENSE) license.

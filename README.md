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

## Currently used by

- [📦 obuild](https://github.com/unjs/obuild/)
- [🌳 rou3](https://github.com/h3js/rou3/)
- [💥 srvx](https://github.com/h3js/srvx)
- [🕊️ unenv](https://github.com/unjs/unenv)
- [🕰️ omnichron](https://github.com/oritwoen/omnichron)
- [...add yours...]

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

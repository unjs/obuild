# 📦 obuild 😯

✅ Zero-config ESM/TS package builder.

Powered by [**oxc**](https://oxc.rs/), [**rolldown**](https://rolldown.rs/) and [**rolldown-plugin-dts**](https://github.com/sxzz/rolldown-plugin-dts).

The **obuild** project aims to be the next-generation successor to current [unbuild](https://github.com/unjs/unbuild).

- 🌱 Fresh rewrite with cleanups and removal of legacy features.
- 🚀 Uses [**oxc**](https://oxc.rs/) and [**rolldown**](https://rolldown.rs/) instead of rollup and mkdist.
- 👌 Strict ESM-compliant imports with explicit extensions.
- 🔒 Types are build with isolated declaration constraints.
- 🪦 No support for CommonJS output.

Some differences are not easy to adopt. Developing as a standalone project allows faster progress and dogfooding in real projects.

### Currently used by

- 📦 [obuild](https://github.com/unjs/obuild/) itself
- [🌳 rou3](https://github.com/h3js/rou3/)

> [!IMPORTANT]
>
> This is a proof-of-concept project.
>
> Features are incomplete, and output behavior may change between versions.
>
> Feedback and contributions are very welcome! If you'd like to make changes with more than a few lines of code, please open an issue first to discuss.

## License

💛 Released under the [MIT](./LICENSE) license.

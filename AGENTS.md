**Keep AGENTS.md updated with project status.**

## Architecture

### Entry Points

- **CLI:** `src/cli.ts` - Uses `node:util` `parseArgs` and `c12` for config loading (`build.config.{ts,js,...}`)
- **Programmatic API:** `src/index.ts` - Exports `build()` and types
- **Config helper:** `src/config.ts` - Exports `defineBuildConfig()`

### Core Flow (`src/build.ts`)

1. Resolve `cwd`, read `package.json`
2. Normalize entries (string shorthand or typed objects)
3. Fire `hooks.start`, `hooks.entries`
4. Clean output directories
5. For each entry: run **bundle** or **transform** builder
6. Fire `hooks.end`, print summary

### Builders

#### Bundle (`src/builders/bundle.ts`)

- Uses **rolldown** for bundling
- Uses **rolldown-plugin-dts** for `.d.mts` generation (enabled by default, `dts: false` to disable)
- Output: ESM (`.mjs`) with code-splitting for `node_modules` into `_chunks/libs/`
- Externals: Node.js builtins + `dependencies` + `peerDependencies` from `package.json`
- Plugins: shebang (executable detection), import-attributes (`bytes`/`text` imports), license (third-party license file), nf3 externals (opt-in via `trace`)
- Dependency tracing: `trace: string[] | TraceOptions` (opt-in, per package) lazily imports `nf3/plugin`; listed packages are matched by exact name (`pkg`, `pkg/sub`, `.../node_modules/pkg/...`), externalized and traced into `<outDir>/node_modules`. Everything else is bundled as usual.
- Stub mode: generates re-export files pointing to source
- Post-build: reports size, minified size, gzip size, side-effect size per entry

#### Transform (`src/builders/transform.ts`)

- Uses **oxc-transform** (via `rolldown/utils`) for file-by-file `.ts` -> `.mjs` transpilation
- Uses **magic-string** + **exsolve** for import specifier rewriting (`.ts` -> `.mjs`)
- Supports isolated declarations via oxc (`stripInternal: true`)
- Supports `filter` and `dts` callback functions per entry
- Non-`.ts` files are copied as-is (or symlinked in stub mode)
- Parallel file processing with `Promise.allSettled`

### Plugins (`src/builders/plugins/`)

- **shebang.ts** - Detects `#!` lines and makes output files executable (`chmod 0o755`)
- **import-attributes.ts** - Implements `with { type: "bytes" | "text" }` imports (TC39 proposals; rolldown parses but drops the attributes). Rewrites them via oxc `parseSync` + `Visitor` + magic-string to `bytes:`/`text:` specifiers, resolved to `\0<path>?obuild-<type>` virtual modules: text is loaded with rolldown's `text` module type, bytes as a base64 `Uint8Array` JS module (plugins can only return UTF-8 strings, so the built-in `binary` type is unusable). `.d.ts` importers (dts plugin) resolve to `\0obuild-<type>.d.ts` declaring `Uint8Array`/`string`.
- **license.ts** - Generates `THIRD-PARTY-LICENSES.md` from bundled dependencies (based on Vite's approach). Disable per-entry with `license: false`; emit gzipped (`THIRD-PARTY-LICENSES.md.gz`) with `license: { gzip: true }`.

### Types (`src/types.ts`)

- `BuildConfig` - Top-level config: `cwd`, `entries`, `hooks`
- `BuildEntry` = `BundleEntry | TransformEntry`
- `BundleEntry` - `type: "bundle"`, `input` (string/array), `minify`, `rolldown` options, `dts`, `license`, `trace`
- `TraceOptions` - nf3 `ExternalsTraceOptions` + `include: string[]` (package names)
- `TransformEntry` - `type: "transform"`, `input` (directory), `minify`, `oxc` options, `resolve`, `filter`, `dts`
- `BuildHooks` - `start`, `end`, `entries`, `rolldownConfig`, `rolldownOutput`

### Utilities (`src/utils.ts`)

- `fmtPath()` - Format path relative to cwd
- `analyzeDir()` - Count files and total byte size
- `distSize()` - Bundle and measure: raw, minified, min+gzip sizes
- `sideEffectSize()` - Measure side-effect code size via tree-shaking

## CLI Usage

```bash
obuild [entries...] [--dir <path>] [--stub]
```

**Entry string shorthand:**

- `src/index` or `src/index,src/cli` -> bundle entry (comma-separated for multiple inputs)
- `src/runtime/` -> transform entry (trailing slash)
- `src/index:dist/custom` -> custom output directory (after `:`)

## Config File

`build.config.ts` (loaded via c12):

```ts
import type { BuildConfig } from "obuild/config";
export default { entries: [...] } satisfies BuildConfig;
```

## Key Dependencies

| Dependency            | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `rolldown`            | Bundler (Rust-based, Rollup-compatible)          |
| `rolldown-plugin-dts` | Declaration file generation for bundle           |
| `nf3`                 | Per-package `node_modules` tracing (`trace`)     |
| `rolldown/utils`      | `transformSync`, `parseSync`, `minifySync` (oxc) |
| `exsolve`             | Module path resolution                           |
| `magic-string`        | Source text manipulation for import rewriting    |
| `c12`                 | Config file loading                              |
| `consola`             | Logging                                          |
| `tinyglobby`          | Fast glob for transform directory scanning       |
| `defu`                | Deep defaults merging                            |
| `pathe`               | Cross-platform path utilities                    |
| `pretty-bytes`        | Human-readable file sizes                        |

## Development

```bash
# Enable node via fnm
eval "$(fnm env --use-on-cd 2>/dev/null)"

# Run tests
pnpm vitest run test/obuild.test.ts

# Build
pnpm build

# Lint
pnpm lint

# Type check
pnpm test:types   # uses tsgo
```

## Test Structure

- `test/obuild.test.ts` - Integration test: builds fixture, verifies output files, validates exports, checks shebang permissions
- `test/fixture/` - Test fixture with `build.config.ts`, bundle entries (`index`, `cli`, `utils`, `trace`, `import-attributes`), transform entry (`runtime/`), and `files/` (imported as bytes/text; `bytes.bin` holds every byte value)

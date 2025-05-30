# Transformers

## `oxc` - TypeScript/JSX/TSX transformer

The `oxc` transformer handles TypeScript and JSX/TSX file transformations using the [oxc-transform](https://www.npmjs.com/package/oxc-transform) package under the hood.

Configure the `oxc` transformer using the `oxc` option in your build configuration:

```ts
import { defineBuildConfig } from "obuild";

export default defineBuildConfig({
  entries: [
    {
      type: "transform",
      input: "./src/runtime",
      outDir: "./dist/runtime",
      oxc: {
        // Enable minification and sourcemaps
        minify: {
          sourcemap: true,
        },
      },
    },
  ],
});
```

## `vue` - Vue SFC transformer

The `vue` transformer processes Vue Single File Components (SFCs) using the [vue-sfc-transformer](https://github.com/nuxt-contrib/vue-sfc-transformer) package.

You can configure the `vue` transformer with the `vue` option in your build config.

```ts
import { defineBuildConfig } from "obuild";
export default defineBuildConfig({
  entries: [
    {
      type: "transform",
      input: "./src/runtime",
      outDir: "./dist/runtime",
      vue: {
        // Disable TypeScript declaration generation for Vue SFCs
        dts: false,
      },
    },
  ],
});
```

## Custom transformers

For transform entries, use the `transformers` option to specify custom transformers or modify the execution order of default transformers.

```ts
import { defineBuildConfig } from "obuild";
import type {
  InputFile,
  OutputFile,
  TransformerContext,
} from "obuild/transformers";

export default defineBuildConfig({
  entries: [
    {
      type: "transform",
      input: "./src/runtime",
      outDir: "./dist/runtime",
      transformers: [
        "vue", // Prepend the default built-in Vue transformer before your custom transformer.
        {
          type: "transform",
          input: "./src/transformers/index.ts",
          transformers: [
            (input: InputFile, context: TransformerContext): OutputFile[] => {
              if (!input.path.endsWith(".foo")) {
                // Do not process non-foo files
                return undefined;
              }

              const output: OutputFile[] = [];
              // ...do your transformation logic here and add the processed files to the output array
              return output;
            },
          ],
        },
      ],
    },
  ],
});
```

## Composing a custom transformer

Create custom transformers by implementing the `Transformer` interface. Here's an example that processes files with a specific extension and adds custom configuration options:

```ts
// src/transformers/foo.ts
import type {
  InputFile,
  OutputFile,
  Transformer,
  TransformerContext,
  TransformerOptions,
} from "obuild/transformers";

declare module "obuild/transformers" {
  export interface TransformerOptions {
    foo?: {
      customFooExtension?: string; // Custom option for your transformer
    };
  }
}

export const fooTransformer: Transformer = async (
  inputFile: InputFile,
  context: TransformerContext,
) => {
  const { customFooExtension = ".foo" } = context.options;

  if (!input.path.endsWith(customFooExtension)) {
    // Do not process non-foo files
    return undefined;
  }

  const output: OutputFile[] = [];
  // ...do your transformation logic here and add the processed files to the output array
  return output;
};
```

Use your custom transformer in the build configuration:

```ts
import { defineBuildConfig } from "obuild";
import { fooTransformer } from "./src/transformers/foo.ts"; // Import your custom transformer

export default defineBuildConfig({
  entries: [
    {
      type: "transform",
      input: "./src/runtime",
      outDir: "./dist/runtime",
      transformers: [fooTransformer],
      foo: {
        customFooExtension: ".custom-foo", // Custom option for your transformer
      },
    },
  ],
});
```

import type { BuildConfig } from "obuild";

export default <BuildConfig>{
  entries: [
    {
      type: "bundle",
      input: [
        "./src/index.ts",
        "./src/cli.ts",
        "./src/utils.ts",
        "./src/import-attributes.ts",
        "./src/compress.ts",
      ],
      minifyLibs: ["undici"],
      compressLibs: ["undici"],
    },
    {
      type: "transform",
      input: "./src/runtime/",
      outDir: "./dist/runtime/",
    },
  ],
};

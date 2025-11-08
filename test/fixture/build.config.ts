import type { BuildConfig } from "obuild";

export default <BuildConfig>{
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/utils.ts"],
    },
    {
      type: "transform",
      input: "./src/runtime/",
      outDir: "./dist/runtime/",
    },
  ],
};

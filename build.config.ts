import { defineBuildConfig } from "./src/config.ts";

export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/config.ts"],
    },
    {
      type: "bundle",
      input: "./src/worker.ts",
      dts: false,
    },
  ],
});

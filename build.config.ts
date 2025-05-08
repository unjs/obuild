import { defineBuildConfig } from "./src/config.ts";

export default defineBuildConfig({
  entries: ["./src/cli.ts", "./src/config.ts"],
});

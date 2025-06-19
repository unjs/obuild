export { test } from "./test.ts"; // Explicitly import the test file with .ts extension

// Module resolution test imports, using no extensions
export { tsModule } from "./modules/ts-module.ts";

// @ts-expect-error - JS test file
export { jsModule } from "./modules/js-module";

export default "default export";

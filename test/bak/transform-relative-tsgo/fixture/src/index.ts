const { dynamicModule } = await import("./modules/dynamic");

export { dynamicModule };

export { test } from "./test.ts"; // Explicitly import the test file with .ts extension

// Module resolution test imports, using no extensions
export { indexModule } from "./modules";
export { tsModule } from "./modules/ts-module";

export { jsModule } from "./modules/js-module.js";
export { mjsModule } from "./modules/mjs-module.mjs";

export default "default export";

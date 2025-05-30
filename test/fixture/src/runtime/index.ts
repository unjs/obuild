export { test } from "./test.ts"; // Explicitly import the test file with .ts extension

// Module resolution test imports, using no extensions
export { tsModule } from "./modules/ts-module.ts";

export { TsxComponent } from "./components/tsx.tsx";

// @ts-expect-error - JS test file
export { jsModule } from "./modules/js-module";

// @ts-expect-error - JSX test file
export { JsxComponent } from "./components/jsx.jsx";

export default "default export";

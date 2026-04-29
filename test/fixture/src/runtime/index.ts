export { test } from "./test.ts"; // Explicitly import the test file with .ts extension

// @ts-expect-error - JS test file
export { jsModule } from "./js-module"; // Without extension
export { tsModule } from "./ts-module"; // Without extension

// Regression: dynamically resolve a sibling that fails --isolatedDeclarations.
// The transform builder must still emit ./broken.mjs so this load works at
// runtime — see unjs/obuild#82. Dynamic import keeps `broken.ts` out of the
// static type-check graph (it intentionally violates the rule).
export const loadBroken = (): Promise<{ Flags: { None: number } }> =>
  import("./broken.mjs" as string);

export default "default export";

// Triggers TS9013 under --isolatedDeclarations: shift expression in `as const`
// object can't be inferred without an explicit type annotation.
export const Flags = {
  None: 0,
  A: 1 << 0,
  B: 1 << 1,
} as const;

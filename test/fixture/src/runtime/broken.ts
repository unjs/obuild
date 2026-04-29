// Triggers TS9013 inside oxc-transform: shift expressions in an `as const`
// object can't be inferred without an explicit type annotation. The
// transform builder should still emit broken.mjs (with a warning) and
// keep sibling .d.mts files intact — see unjs/obuild#82.
export const Flags = {
  None: 0,
  A: 1 << 0,
  B: 1 << 1,
} as const;

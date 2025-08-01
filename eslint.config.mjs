import unjs from "eslint-config-unjs";

export default unjs({
  ignores: ["test/**/fixture"],
  rules: {
    "unicorn/no-null": "off",
    "unicorn/no-nested-ternary": "off",
  },
  markdown: {
    rules: {
      // markdown rule overrides
    },
  },
});

import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    rules: {
      "no-unused-vars": "error",
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      curly: "error",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["build/", "node_modules/"],
  },
];

import js from "@eslint/js";

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
};
const browserGlobals = {
  document: "readonly",
  window: "readonly",
  location: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  confirm: "readonly",
  URLSearchParams: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: nodeGlobals },
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
    files: ["app/public/**/*.js"],
    languageOptions: { globals: browserGlobals },
  },
  {
    ignores: ["build/", "node_modules/", "data/"],
  },
];

import globals from "globals";

export default [
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      indent: ["error", "tab"],
      semi: ["error", "always"],
    },
    ignores: ["**/vendor/**", "**/**/*.min.js"],
  },
];

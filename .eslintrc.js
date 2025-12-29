module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  rules: {
    // Enforce tab indentation
    "indent": ["error", "tab"],
    // Require semicolons
    "semi": ["error", "always"],
  },
};

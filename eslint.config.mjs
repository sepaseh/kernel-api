import js from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

import { processAccessViolations } from "./scripts/check-boundaries.mjs";

const environmentOwnership = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      ownership: "{{reason}}",
    },
  },
  create: (context) => ({
    Program: () => {
      for (const { line, reason } of processAccessViolations(
        context.sourceCode.text,
        context.filename,
      ))
        context.report({
          loc: { line, column: 0 },
          messageId: "ownership",
          data: { reason },
        });
    },
  }),
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/dist/**",
      "**/reports/**",
      "collection/environments/**",
      "server/data/**",
      "test-results/**",
      "_local-preserved/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "separate-type-imports", prefer: "type-imports" },
      ],
      "no-dupe-keys": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["src/{contracts,application}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    plugins: {
      foundation: { rules: { "environment-ownership": environmentOwnership } },
    },
    rules: {
      "foundation/environment-ownership": "error",
    },
  },
];

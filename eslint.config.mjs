import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "next-env.d.ts",

    // Vendored/generated artifacts. They are consumed by the app but should
    // not determine source lint health.
    "public/**/*.min.*",
    "public/pdf*.mjs",
    "scripts/_gen_audit_out/**",

    // Remotion scenes are maintained as a separate rendering surface and need
    // their own lint pass before they can share the stricter app rules.
    "remotion/**",
  ]),
  {
    rules: {
      // Baseline legacy debt as warnings so `npm run lint` can be used as a
      // merge gate again. Tighten these back to errors path-by-path as files
      // are migrated off @ts-nocheck/any.
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-explicit-any": "warn",

      // React Compiler rules expose useful modernization work, but this app
      // already has a backlog of older patterns. Keep visibility without
      // blocking unrelated merges.
      "react-hooks/error-boundaries": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;

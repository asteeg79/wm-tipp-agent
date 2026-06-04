// ESLint Flat Config (ESLint 9) für das gesamte Monorepo.
// - typescript-eslint "recommended" (ohne typgeprüfte Regeln → schnell & ruhig)
// - React-Hooks-Regeln nur für die App
// - eslint-config-prettier zuletzt: deaktiviert stil-Regeln, die Prettier abdeckt
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "data/**",
      "app/public/**",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Gemeinsame Regel-Anpassungen (pragmatisch, hält Bestand grün).
    rules: {
      // _-präfigierte Argumente/Variablen sind bewusst ungenutzt.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // any ist unerwünscht, aber nur Warnung (Bestand pragmatisch).
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["app/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["pipeline/**/*.ts", "shared/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);

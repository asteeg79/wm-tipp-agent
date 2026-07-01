// ESLint Flat Config (ESLint 9) für das gesamte Monorepo.
// - typescript-eslint "recommended" (ohne typgeprüfte Regeln → schnell & ruhig)
// - React-Hooks-Regeln nur für die App
// - eslint-config-prettier zuletzt: deaktiviert stil-Regeln, die Prettier abdeckt
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "data/**",
      "app/public/**",
      // Cloudflare-Worker: eigene Worker-Runtime-Globals (fetch/console),
      // wird separat via wrangler deployt — nicht Teil des App/Pipeline-Lints.
      "infra/**",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // SonarJS: Code-Smell-/Komplexitäts-Regeln (Sonar-Qualität ohne Server/Token).
  sonarjs.configs.recommended,
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

      // SonarJS-Feinschliff:
      // Fehlalarme für diesen Code AUS —
      "sonarjs/pseudo-random": "off", // RNG für Backoff-Jitter/Simulation, nicht Krypto
      "sonarjs/void-use": "off", // `void promise` markiert bewusst Floating Promises
      "sonarjs/no-unused-vars": "off", // deckt @typescript-eslint ab (inkl. ^_-Ausnahme)
      // Echte, aber subjektive/refactor-lastige Signale nur als Warnung
      // (sichtbar in `pnpm lint`, blockiert CI nicht — bewusst über Zeit angehen):
      "sonarjs/cognitive-complexity": "warn",
      "sonarjs/no-nested-conditional": "warn",
      "sonarjs/super-linear-regex": "warn",
      "sonarjs/regex-complexity": "warn",
      "sonarjs/no-small-switch": "warn",
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
  {
    // Vercel Edge Middleware + API-Functions: Web-Globals (Request/Response/
    // fetch) + process.
    files: ["app/middleware.ts", "app/api/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettier,
);

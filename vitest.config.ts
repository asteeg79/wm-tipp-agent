import { defineConfig } from "vitest/config";

/**
 * Vitest-Konfiguration für den deterministischen Kern (pipeline + shared).
 *
 * Getestet wird die berechnende, gut isolierbare Logik (Elo, Form, Poisson,
 * Engine, Accuracy, Reconciliation, Odds-De-vig, Schemas …) — nicht die
 * Netzwerk-/KI-Adapter und nicht das React-UI (geringer Korrektheitsnutzen).
 *
 * Tests liegen in `<paket>/tests/**` (außerhalb von `src/`), damit der
 * Produktions-Typecheck (`tsc --noEmit` über `src`) unberührt bleibt.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["pipeline/tests/**/*.test.ts", "shared/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["pipeline/src/**/*.ts", "shared/src/**/*.ts"],
      // Reine Netzwerk-/Seiteneffekt-Adapter sind vom Coverage-Ziel ausgenommen.
      exclude: [
        "pipeline/src/index.ts",
        "pipeline/src/sources/http.ts",
        "pipeline/src/predict/models.ts",
        "**/*.d.ts",
      ],
    },
  },
});

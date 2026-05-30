/**
 * Einstiegspunkt der Daten- & Prognose-Pipeline.
 *
 * Ablauf (siehe Abschnitt 10.1 der Spezifikation) — wird in den Phasen 1–6
 * schrittweise mit echter Logik gefüllt. In Phase 0 nur ein Gerüst, das
 * sauber startet und stoppt.
 */

import { config } from "../config.js";

async function main(): Promise<void> {
  console.log("[pipeline] WM-Tipp-Assistent 2026 — Pipeline-Lauf gestartet");
  console.log("[pipeline] Konfiguration geladen:", {
    decayHalfLifeDays: config.decayHalfLifeDays,
    opponentHighlightWeight: config.opponentHighlightWeight,
    formWindow: config.formWindow,
    models: config.models,
  });

  // TODO Phase 1: Fixtures/Teams laden → index.json + teams/*.json
  // TODO Phase 3: News (RSS) holen, filtern, taggen
  // TODO Phase 4: Feature-Engine (Form, Zeit-Decay, Elo, Poisson, H2H)
  // TODO Phase 5: KI-Ensemble (Claude + ChatGPT) + Reconciliation
  // TODO Phase 6: actualResult + Accuracy-Metriken

  console.log("[pipeline] Phase 0: noch keine Datenlogik. Lauf beendet.");
}

main().catch((err) => {
  console.error("[pipeline] Fehler:", err);
  process.exitCode = 1;
});

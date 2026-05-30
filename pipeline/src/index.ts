/**
 * Einstiegspunkt der Daten- & Prognose-Pipeline.
 * Ablauf siehe Abschnitt 10.1 der Spezifikation — wird phasenweise gefüllt.
 */
import { join } from "node:path";
import { config } from "../config.js";
import { buildData } from "./buildData.js";
import { repoRoot } from "./io/paths.js";
import { ApiFootballProvider } from "./sources/apiFootball.js";

/** Lädt lokal die Root-.env (in CI kommen die Werte direkt aus dem Env). */
function loadDotenvIfPresent(): void {
  try {
    process.loadEnvFile(join(repoRoot, ".env"));
  } catch {
    // keine .env vorhanden (z. B. in GitHub Actions) → ignorieren
  }
}

async function main(): Promise<void> {
  loadDotenvIfPresent();
  console.log("[pipeline] WM-Tipp-Assistent 2026 — Pipeline-Lauf gestartet");
  console.log(
    `[pipeline] Wettbewerb: league=${config.worldCup.leagueId} season=${config.worldCup.season}`,
  );

  const apiKey = process.env.API_FOOTBALL_KEY ?? "";
  if (!apiKey) {
    console.error(
      "[pipeline] API_FOOTBALL_KEY fehlt. In .env eintragen (lokal) bzw. als Secret (CI).",
    );
    process.exitCode = 1;
    return;
  }

  const provider = new ApiFootballProvider(apiKey);

  // Phase 1: Struktur + Historie → index.json + teams/*.json
  const stats = await buildData(provider);

  console.log("[pipeline] Phase 1 abgeschlossen:");
  console.table({
    Teams_gesamt: stats.teamsTotal,
    Teams_geschrieben: stats.teamsWritten,
    Teams_offen: stats.teamsSkipped,
    Spiele_geladen: stats.fixturesLoaded,
    API_Requests: stats.requestsUsed,
    Budget_erschoepft: stats.budgetExhausted,
  });

  // TODO Phase 3: News (RSS) · Phase 4: Feature-Engine · Phase 5: KI-Ensemble
}

main().catch((err) => {
  console.error("[pipeline] Fehler:", err);
  process.exitCode = 1;
});

/**
 * Einstiegspunkt der Daten- & Prognose-Pipeline.
 * Datenquelle: ausschließlich openfootball (gemeinfrei, kein API-Key).
 *   Struktur/Spielplan: worldcup.json · Historie: internationals (Football.TXT)
 */
import { join } from "node:path";
import { config } from "../config.js";
import { buildData } from "./buildData.js";
import { repoRoot } from "./io/paths.js";
import { OpenFootballProvider } from "./sources/openFootball.js";
import { OpenFootballHistoryProvider } from "./sources/openFootballHistory.js";
import {
  noHistoryProvider,
  type HistoryProvider,
  type TournamentProvider,
} from "./sources/types.js";

/** Lädt lokal die Root-.env (in CI kommen die Werte direkt aus dem Env). */
function loadDotenvIfPresent(): void {
  try {
    process.loadEnvFile(join(repoRoot, ".env"));
  } catch {
    // keine .env (z. B. GitHub Actions) → ignorieren
  }
}

function makeTournamentProvider(): TournamentProvider {
  switch (config.providers.tournament) {
    case "openfootball":
      return new OpenFootballProvider();
    default:
      throw new Error(
        `Tournament-Provider '${config.providers.tournament}' nicht unterstützt`,
      );
  }
}

function makeHistoryProvider(): HistoryProvider {
  return config.providers.history === "openfootball"
    ? new OpenFootballHistoryProvider()
    : noHistoryProvider;
}

async function main(): Promise<void> {
  loadDotenvIfPresent();
  console.log("[pipeline] WM-Tipp-Assistent 2026 — Pipeline-Lauf gestartet");
  console.log(
    `[pipeline] Provider: tournament=${config.providers.tournament} history=${config.providers.history} (openfootball, kein Key)`,
  );

  const tournamentProvider = makeTournamentProvider();
  const historyProvider = makeHistoryProvider();

  // Flags: WM_NO_NEWS=1 / WM_NO_AI=1 zum gezielten Überspringen (Tests).
  const withNews = process.env.WM_NO_NEWS !== "1";
  const withAi = process.env.WM_NO_AI !== "1";

  const stats = await buildData(tournamentProvider, historyProvider, {
    withNews,
    withAi,
  });

  console.log("[pipeline] Lauf abgeschlossen:");
  console.table({
    Teams_gesamt: stats.teamsTotal,
    Teams_geschrieben: stats.teamsWritten,
    Teams_fehlgeschlagen: stats.teamsFailed,
    Matches_geschrieben: stats.matchesWritten,
    Historie_Spiele: stats.historyLoaded,
    News_Items: stats.newsLoaded,
    KI_bewertet: stats.aiEvaluated,
    KI_uebersprungen: stats.aiSkipped,
  });
}

main().catch((err) => {
  console.error("[pipeline] Fehler:", err);
  process.exitCode = 1;
});

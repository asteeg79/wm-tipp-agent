/**
 * Einstiegspunkt der Daten- & Prognose-Pipeline.
 * Datenquelle: ausschließlich openfootball (gemeinfrei, kein API-Key).
 *   Struktur/Spielplan: worldcup.json · Historie: internationals (Football.TXT)
 */
import { config } from "../config.js";
import { buildData } from "./buildData.js";
import { OpenFootballProvider } from "./sources/openFootball.js";
import { OpenFootballHistoryProvider } from "./sources/openFootballHistory.js";
import {
  noHistoryProvider,
  type HistoryProvider,
  type TournamentProvider,
} from "./sources/types.js";

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
  console.log("[pipeline] WM-Tipp-Assistent 2026 — Pipeline-Lauf gestartet");
  console.log(
    `[pipeline] Provider: tournament=${config.providers.tournament} history=${config.providers.history} (openfootball, kein Key)`,
  );

  const tournamentProvider = makeTournamentProvider();
  const historyProvider = makeHistoryProvider();

  const stats = await buildData(tournamentProvider, historyProvider);

  console.log("[pipeline] Phase 1 (openfootball-only) abgeschlossen:");
  console.table({
    Teams_gesamt: stats.teamsTotal,
    Teams_geschrieben: stats.teamsWritten,
    Teams_fehlgeschlagen: stats.teamsFailed,
    Matches_geschrieben: stats.matchesWritten,
    Historie_Spiele: stats.historyLoaded,
  });

  // TODO Phase 3: News · Phase 4: Feature-Engine · Phase 5: KI-Ensemble
}

main().catch((err) => {
  console.error("[pipeline] Fehler:", err);
  process.exitCode = 1;
});

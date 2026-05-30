/**
 * Einstiegspunkt der Daten- & Prognose-Pipeline.
 * Datenquelle: ausschließlich openfootball (gemeinfrei, kein API-Key).
 *   Struktur/Spielplan: worldcup.json · Historie: internationals (Football.TXT)
 */
import { readFileSync } from "node:fs";
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

/**
 * Lädt lokal die Root-.env (in CI kommen die Werte direkt aus dem Env).
 * WICHTIG: überschreibt vorhandene env-Variablen mit nicht-leerem .env-Wert —
 * node:loadEnvFile tut das NICHT, und die Shell kann z. B. ANTHROPIC_API_KEY=""
 * vorbelegen, was sonst den echten Key blockiert.
 */
function loadDotenvIfPresent(): void {
  let raw: string;
  try {
    raw = readFileSync(join(repoRoot, ".env"), "utf8");
  } catch {
    return; // keine .env (z. B. GitHub Actions) → Werte kommen direkt aus env
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // umschließende Quotes entfernen
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Nur setzen, wenn die .env einen nicht-leeren Wert liefert (Override).
    if (value !== "") process.env[key] = value;
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
    Accuracy_bewertet: stats.accuracyScored,
  });
}

main().catch((err) => {
  console.error("[pipeline] Fehler:", err);
  process.exitCode = 1;
});

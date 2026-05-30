/**
 * Zentrale Pipeline-Konfiguration.
 * Alle Modell-/Mathe-Parameter sind hier gebündelt, damit sie später per
 * Backtest tunebar sind (Abschnitt 11.3 / 20.3 der Spezifikation).
 */

export interface PipelineConfig {
  /** Zeit-Decay-Halbwertszeit in Tagen (w_i = 0.5^(Δt/H)). */
  decayHalfLifeDays: number;
  /** Zusatzgewicht für Spiele gegen mögliche WM-Gegner. */
  opponentHighlightWeight: number;
  /** Fensterlänge für "aktuelle Form" (Anzahl Spiele). */
  formWindow: number;
  /** Wie viele Jahre Historie geladen werden. */
  historyYears: number;
  /** Home-Field-Advantage in Elo-Punkten (Gastgeber). */
  homeFieldAdvantageElo: number;
  /** Re-Trigger-Milestones in Stunden vor Anpfiff. */
  reTriggerMilestonesHours: number[];
  /** Max. Anzahl gespeicherter News-Items pro Team. */
  maxNewsPerTeam: number;
  /** Modellnamen (konfigurierbar, damit Updates leicht möglich sind). */
  models: {
    claude: string;
    chatgpt: string;
  };
  /** Ensemble-Strategie. */
  ensemble: {
    /** Mittelwert konfidenz-gewichten? */
    confidenceWeighted: boolean;
  };
  /** Rate-Limit: max. parallele API-Requests. */
  maxConcurrentRequests: number;
  /** Free-Tier-Schutz: max. Fußball-API-Requests pro Lauf. */
  maxFootballRequestsPerRun: number;
  /** WM-Wettbewerb (nichts hartcodieren — hier zentral). */
  worldCup: {
    /** API-Football League-ID (World Cup = 1). */
    leagueId: number;
    /** Saison (Jahr). Default 2026; per Env WM_SEASON überschreibbar (Test). */
    season: number;
  };
  /** API-Football-Provider-Einstellungen. */
  apiFootball: {
    baseUrl: string;
    /** Max. Versuche bei 429/5xx. */
    maxRetries: number;
    /** Basis-Wartezeit (ms) für exponentielles Backoff. */
    backoffBaseMs: number;
  };
}

/** Saison aus Env (Testläufe gegen Free-zugängliche Saisons), sonst Default. */
function resolveSeason(defaultSeason: number): number {
  const env = process.env.WM_SEASON;
  if (env && /^\d{4}$/.test(env)) return Number(env);
  return defaultSeason;
}

export const config: PipelineConfig = {
  decayHalfLifeDays: 180,
  opponentHighlightWeight: 1.5,
  formWindow: 10,
  historyYears: 2,
  homeFieldAdvantageElo: 65,
  reTriggerMilestonesHours: [72, 24, 3],
  maxNewsPerTeam: 20,
  models: {
    claude: "claude-opus-4-8",
    chatgpt: "gpt-4o",
  },
  ensemble: {
    confidenceWeighted: true,
  },
  maxConcurrentRequests: 4,
  maxFootballRequestsPerRun: 90,
  worldCup: {
    leagueId: 1,
    season: resolveSeason(2026),
  },
  apiFootball: {
    baseUrl: "https://v3.football.api-sports.io",
    maxRetries: 4,
    backoffBaseMs: 1500,
  },
};

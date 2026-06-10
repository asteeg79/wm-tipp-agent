/**
 * Zentrale Pipeline-Konfiguration.
 * Alle Modell-/Mathe-Parameter sind hier gebündelt, damit sie später per
 * Backtest tunebar sind (Abschnitt 11.3 / 20.3 der Spezifikation).
 *
 * Datenquelle: ausschließlich **openfootball** (gemeinfrei, kein API-Key).
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
  /** Elo-Parameter (World-Football-Elo-Logik). */
  elo: {
    /** Start-Rating für alle Teams. */
    initial: number;
    /** K-Faktor (Update-Geschwindigkeit). */
    k: number;
    /** Tor-Differenz-Multiplikator aktivieren. */
    goalDifferenceFactor: boolean;
  };
  /** Poisson-Baseline-Parameter. */
  poisson: {
    /** Liga-Durchschnitt Tore pro Team und Spiel (Skalierung). */
    leagueAvgGoals: number;
    /** Max. Tore pro Team in der Score-Matrix. */
    maxGoals: number;
    /** Wie stark die Elo-Differenz die erwarteten Tore beeinflusst. */
    eloToGoalsScale: number;
    /**
     * Gewicht des asymmetrischen Momentum-Terms (0..1): Mischung aus
     * "Tore erzielt (letzte N)" des angreifenden Teams und "Tore kassiert
     * (letzte M)" des Gegners. 0 = aus (nur gewichtete Form), 1 = nur Momentum.
     */
    momentumWeight: number;
    /** Fenster für erzielte Tore (Angriffs-Momentum). */
    momentumScoredWindow: number;
    /** Fenster für kassierte Tore des Gegners (Abwehr-Momentum). */
    momentumConcededWindow: number;
  };
  /**
   * Mentalitäts-/Konföderations-Faktoren (Goldman-Sachs-inspiriert).
   * Multiplikatoren auf die erwarteten Tore (λ).
   */
  factors: {
    /** Malus auf λ des Titelverteidigers ("Winner's Slump"). */
    winnersSlump: number;
    /** Team-ID des amtierenden Weltmeisters (FIFA-Code). */
    defendingChampionId: string;
    /** Es ist schwerer, gegen europäische Teams zu treffen → λ-Malus für den Gegner. */
    vsEuropeanDefenseBonus: number;
    /** λ-Boost für etablierte Top-Nationen. */
    majorNationBoost: number;
  };
  /** Re-Trigger-Milestones in Stunden vor Anpfiff. */
  reTriggerMilestonesHours: number[];
  /** Max. Anzahl gespeicherter News-Items pro Team. */
  maxNewsPerTeam: number;
  /** Modellnamen (konfigurierbar, damit Updates leicht möglich sind). */
  models: {
    claude: string;
    chatgpt: string;
    /** Günstiges Modell für die ressourcenschonende News-Relevanzprüfung. */
    newsFilter: string;
  };
  /** Ensemble-Strategie. */
  ensemble: {
    /** Mittelwert konfidenz-gewichten? */
    confidenceWeighted: boolean;
  };
  /** openfootball-Provider (gemeinfrei, kein Key). */
  openFootball: {
    /** Raw-Basis-URL des worldcup.json-Repos (Struktur/Spielplan). */
    worldCupBaseUrl: string;
    /** Raw-Basis-URL des internationals-Repos (Historie). */
    internationalsBaseUrl: string;
    /** WM-Jahr (2018/2022/2026). */
    season: number;
  };
  /** Provider-Auswahl. */
  providers: {
    /** Quelle für Teams/Gruppen/Spielplan. */
    tournament: "openfootball";
    /** Quelle für Länderspiel-Historie (Form/H2H). */
    history: "openfootball" | "none";
  };
  /** Buchmacher-Quoten (The Odds API, optional via ODDS_API_KEY). */
  odds: {
    /** Sport-Key bei The Odds API. */
    sport: string;
    /** Quoten-Region(en), z. B. "eu". */
    regions: string;
    /** Cache-TTL in Stunden (begrenzt Credit-Verbrauch, Free-Tier 500/Monat). */
    ttlHours: number;
    /** Ab diesem Zeitpunkt (UTC) keine Quoten mehr abrufen (WM vorbei). */
    untilDate: string;
  };
}

/** Saison aus Env (Testläufe gegen andere WM-Jahre), sonst Default. */
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
  elo: {
    initial: 1500,
    k: 40,
    goalDifferenceFactor: true,
  },
  poisson: {
    leagueAvgGoals: 1.35,
    maxGoals: 8,
    // Per Backtest getunt (2126 Länderspiele, Walk-Forward): 0.001 minimiert
    // RPS (0.1943 vs. 0.1953 bei 0.0016). `pnpm --filter @wm/pipeline backtest`.
    eloToGoalsScale: 0.001,
    momentumWeight: 0.25,
    momentumScoredWindow: 10,
    momentumConcededWindow: 5,
  },
  factors: {
    winnersSlump: 0.93,
    defendingChampionId: "ARG", // Weltmeister 2022
    vsEuropeanDefenseBonus: 0.96,
    majorNationBoost: 1.03,
  },
  reTriggerMilestonesHours: [72, 24, 3],
  maxNewsPerTeam: 20,
  models: {
    // Claude Fable 5: Anthropics Top-Modell (über Opus). Achtung beim Modell-
    // Wechsel: Fable 5 akzeptiert kein temperature/top_p und kein explizites
    // thinking:"disabled" — der Client nutzt adaptive thinking (models.ts).
    claude: "claude-fable-5",
    chatgpt: "gpt-4o",
    newsFilter: "gpt-4o-mini",
  },
  ensemble: {
    confidenceWeighted: true,
  },
  openFootball: {
    worldCupBaseUrl:
      "https://raw.githubusercontent.com/openfootball/worldcup.json/master",
    internationalsBaseUrl:
      "https://raw.githubusercontent.com/openfootball/internationals/master",
    season: resolveSeason(2026),
  },
  providers: {
    tournament: "openfootball",
    history: "openfootball",
  },
  odds: {
    sport: "soccer_fifa_world_cup",
    regions: "eu",
    // 8h → max 3 Abrufe/Tag. WM 2026 (11.06.–19.07.): ~138 Credits gesamt.
    ttlHours: 8,
    // Nach dem Finale (19.07.2026) keine Abrufe mehr → keine "Leer"-Credits.
    untilDate: "2026-07-20T00:00:00Z",
  },
};

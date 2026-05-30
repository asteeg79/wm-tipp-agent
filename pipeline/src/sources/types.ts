/**
 * Provider-Abstraktion (Abschnitt 8.1): Die konkrete Fußball-API ist
 * austauschbar. Alle Provider liefern in dieses interne, normalisierte
 * Format; die Orchestrierung kennt nur dieses Interface.
 */
import type { Group, TeamSummary, Tournament } from "@wm/shared";

/** Ein normalisiertes Einzelspiel (Sicht-neutral, beide Teams enthalten). */
export interface NormalizedFixture {
  matchId: string;
  /** Kalenderdatum YYYY-MM-DD. */
  date: string;
  competition: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  goalsHome: number;
  goalsAway: number;
  neutral: boolean;
  finished: boolean;
}

/** Turnier-Struktur für index.json. */
export interface TournamentData {
  tournament: Tournament;
  groups: Group[];
  teams: TeamSummary[];
  /** teamId → aktueller Tabellenrang in seiner Gruppe (für KO-Heuristik). */
  rankByTeamId: Record<string, number>;
}

/** Vertrag, den jeder Fußball-Daten-Provider erfüllt. */
export interface DataProvider {
  readonly name: string;
  /** Teams, Gruppen, Turnier-Meta des WM-Wettbewerbs. */
  getTournament(): Promise<TournamentData>;
  /**
   * Alle abgeschlossenen Spiele eines Teams in den angegebenen Saisons
   * (über alle Wettbewerbe hinweg). Nutzt intern Cache + Backoff.
   */
  getTeamFixtures(
    teamId: string,
    seasons: number[],
  ): Promise<NormalizedFixture[]>;
}

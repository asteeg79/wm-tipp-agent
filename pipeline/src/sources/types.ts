/**
 * Provider-Abstraktion (Abschnitt 8.1). Aufgeteilt in zwei Rollen, damit ein
 * Hybrid möglich ist: Struktur/Spielplan aus einer Quelle (openfootball),
 * Historie aus einer anderen (API-Football).
 */
import type { Group, TeamSummary, Tournament } from "@wm/shared";
import type { Stage } from "@wm/shared";

/** Ein normalisiertes Einzelspiel (Sicht-neutral, beide Teams enthalten). */
export interface NormalizedFixture {
  matchId: string;
  /** Kalenderdatum YYYY-MM-DD. */
  date: string;
  /** Voller ISO-Zeitstempel mit Offset, falls bekannt (für Spielplan). */
  dateTime?: string;
  competition: string;
  /** Turnierphase, falls bekannt (für WM-Spielplan). */
  stage?: Stage;
  groupId?: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  /** Spielort (Stadt/Stadion), falls bekannt. */
  ground?: string;
  goalsHome: number | null;
  goalsAway: number | null;
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

/** Liefert Teams/Gruppen/Spielplan des WM-Wettbewerbs. */
export interface TournamentProvider {
  readonly name: string;
  getTournament(): Promise<TournamentData>;
  /** Kompletter WM-Spielplan (für matches/*.json). */
  getSchedule(): Promise<NormalizedFixture[]>;
}

/**
 * Ein perspektiv-normalisiertes historisches Spiel (aus Sicht des Teams).
 * Der Gegner ist bereits auf die kanonische ID (FIFA-Code) gemappt, sodass
 * H2H/Highlights quellenübergreifend funktionieren.
 */
export interface HistoryMatch {
  matchId: string;
  /** Kalenderdatum YYYY-MM-DD. */
  date: string;
  competition: string;
  home: boolean;
  neutral: boolean;
  /** Kanonische ID des Gegners (FIFA-Code, sonst Slug). */
  opponentId: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
}

/** Liefert die Länderspiel-Historie eines Teams (für Form/H2H). */
export interface HistoryProvider {
  readonly name: string;
  /**
   * Alle abgeschlossenen Spiele eines Teams in den angegebenen Saisons
   * (über alle Wettbewerbe hinweg), perspektiv-normalisiert.
   */
  getTeamHistory(
    team: TeamSummary,
    seasons: number[],
  ): Promise<HistoryMatch[]>;
}

/** Provider, der keine Historie liefert (graceful degradation). */
export const noHistoryProvider: HistoryProvider = {
  name: "none",
  async getTeamHistory(): Promise<HistoryMatch[]> {
    return [];
  },
};

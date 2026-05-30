/**
 * Phase-1-Orchestrierung (Hybrid): Struktur/Spielplan aus dem
 * TournamentProvider (openfootball) + Historie aus dem HistoryProvider
 * (API-Football). Schreibt index.json, teams/<id>.json und matches/<id>.json
 * (zod-validiert, inkrementell, budget-bewusst).
 */
import {
  IndexFile,
  Match,
  Team,
  type NewsItem,
  type PotentialOpponent,
  type ScoreLine,
  type Stage,
  type TeamResult,
  type TeamSummary,
} from "@wm/shared";
import { config } from "../config.js";
import { writeJson } from "./io/json.js";
import { indexPath, matchPath, teamPath } from "./io/paths.js";
import { readProgress, writeProgress, type Progress } from "./io/cache.js";
import type {
  HistoryMatch,
  HistoryProvider,
  NormalizedFixture,
  TournamentProvider,
} from "./sources/types.js";
import { computeH2h, deriveOpponentSets } from "./features/opponents.js";

export interface BuildStats {
  teamsTotal: number;
  teamsWritten: number;
  teamsFailed: number;
  matchesWritten: number;
  historyLoaded: number;
}

/** Saisons für die N-Jahres-Historie (eindeutige Jahre im Zeitfenster). */
function historySeasons(now: Date, years: number): number[] {
  const envOverride = process.env.WM_HISTORY_SEASONS;
  if (envOverride) {
    return envOverride
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
  }
  const endYear = now.getUTCFullYear();
  const startYear = new Date(
    Date.UTC(endYear - years, now.getUTCMonth(), now.getUTCDate()),
  ).getUTCFullYear();
  const seasons: number[] = [];
  for (let y = startYear; y <= endYear; y++) seasons.push(y);
  return seasons;
}

/** Wandelt die Historie eines Teams in TeamResult[] um. */
function toTeamResults(
  history: HistoryMatch[],
  potentialIds: Set<string>,
): TeamResult[] {
  return history.map((m) => ({
    matchId: m.matchId,
    date: m.date,
    competition: m.competition,
    home: m.home,
    opponentId: m.opponentId,
    opponentName: m.opponentName,
    goalsFor: m.goalsFor,
    goalsAgainst: m.goalsAgainst,
    venue: m.neutral ? "neutral" : m.home ? "home" : "away",
    isVsPotentialWcOpponent: potentialIds.has(m.opponentId),
  }));
}

export async function buildData(
  tournamentProvider: TournamentProvider,
  historyProvider: HistoryProvider,
): Promise<BuildStats> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Turnierstruktur → index.json
  const { tournament, groups, teams, rankByTeamId } =
    await tournamentProvider.getTournament();
  await writeJson(indexPath, IndexFile, {
    tournament,
    lastUpdated: nowIso,
    groups,
    teams,
  });

  // 2) Mögliche Gegner ableiten
  const opponentSets = deriveOpponentSets(teams, groups, rankByTeamId);

  // 3) Spielplan → matches/<id>.json (skeletal, ohne Prognose)
  const schedule = await tournamentProvider.getSchedule();
  const matchesWritten = await writeMatches(schedule);

  // 4) Historie inkrementell laden (budget-/progress-bewusst)
  const seasons = historySeasons(now, config.historyYears);
  const progress = await readProgress();
  const maxTeams = process.env.WM_MAX_TEAMS
    ? Number(process.env.WM_MAX_TEAMS)
    : Infinity;

  const stats: BuildStats = {
    teamsTotal: teams.length,
    teamsWritten: 0,
    teamsFailed: 0,
    matchesWritten,
    historyLoaded: 0,
  };

  for (const team of teams) {
    if (stats.teamsWritten >= maxTeams) break;
    try {
      const history = await historyProvider.getTeamHistory(team, seasons);
      stats.historyLoaded += history.length;

      const refs = opponentSets.get(team.id) ?? [];
      const potentialIds = new Set(refs.map((r) => r.teamId));
      const results = toTeamResults(history, potentialIds);
      const potentialOpponents: PotentialOpponent[] = refs.map((r) => ({
        teamId: r.teamId,
        stage: r.stage,
        h2hSummary: computeH2h(r.teamId, history),
      }));

      await writeJson(
        teamPath(team.id),
        Team,
        buildTeam(team, nowIso, results, potentialOpponents),
      );
      progress.teamsBackfilled[team.id] = nowIso;
      stats.teamsWritten++;
    } catch (err) {
      // Fehlertoleranz: ein Team-Fehler bricht den Lauf nicht ab.
      stats.teamsFailed++;
      console.warn(`[pipeline] Team ${team.id} übersprungen:`, err);
    }
  }

  await persistProgress(progress);
  return stats;
}

/** Schreibt den Spielplan als skeletale Match-Dokumente. */
async function writeMatches(schedule: NormalizedFixture[]): Promise<number> {
  let count = 0;
  for (const fx of schedule) {
    const stage: Stage = fx.stage ?? "group";
    const actualResult: ScoreLine | null =
      fx.finished && fx.goalsHome !== null && fx.goalsAway !== null
        ? { home: fx.goalsHome, away: fx.goalsAway }
        : null;
    const match: Match = {
      id: fx.matchId,
      date: fx.dateTime ?? `${fx.date}T00:00:00Z`,
      stage,
      homeTeamId: fx.homeTeamId,
      awayTeamId: fx.awayTeamId,
      venue: { city: fx.ground ?? "TBD", neutral: fx.neutral },
      status: fx.finished ? "finished" : "scheduled",
      actualResult,
      predictionHistory: [],
    };
    if (fx.groupId) match.groupId = fx.groupId;
    await writeJson(matchPath(fx.matchId), Match, match);
    count++;
  }
  return count;
}

/** Baut das Team-Dokument; optionale Felder werden bewusst weggelassen. */
function buildTeam(
  summary: TeamSummary,
  lastUpdated: string,
  results: TeamResult[],
  potentialOpponents: PotentialOpponent[],
): Team {
  const emptyNews: NewsItem[] = [];
  const team: Team = {
    id: summary.id,
    name: summary.name,
    code: summary.code,
    groupId: summary.groupId,
    lastUpdated,
    results,
    potentialOpponents,
    news: emptyNews,
  };
  if (summary.logo) team.logo = summary.logo;
  return team;
}

async function persistProgress(progress: Progress): Promise<void> {
  await writeProgress(progress);
}

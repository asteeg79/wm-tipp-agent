/**
 * Phase-1-Orchestrierung: Struktur + 2-Jahres-Historie laden und als
 * index.json + teams/<id>.json schreiben (zod-validiert, inkrementell,
 * rate-limit-/budget-bewusst).
 */
import {
  IndexFile,
  Team,
  type NewsItem,
  type PotentialOpponent,
  type TeamResult,
  type TeamSummary,
} from "@wm/shared";
import { config } from "../config.js";
import { writeJson } from "./io/json.js";
import { indexPath, teamPath } from "./io/paths.js";
import {
  readProgress,
  writeProgress,
  type Progress,
} from "./io/cache.js";
import {
  BudgetExhaustedError,
  getRequestCount,
} from "./sources/apiFootball.js";
import type { DataProvider, NormalizedFixture } from "./sources/types.js";
import { computeH2h, deriveOpponentSets } from "./features/opponents.js";

export interface BuildStats {
  teamsTotal: number;
  teamsWritten: number;
  teamsSkipped: number;
  fixturesLoaded: number;
  requestsUsed: number;
  budgetExhausted: boolean;
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

/** Wandelt die Fixtures eines Teams in TeamResult[] (Team-Perspektive) um. */
function toTeamResults(
  teamId: string,
  fixtures: NormalizedFixture[],
  potentialIds: Set<string>,
): TeamResult[] {
  return fixtures.map((fx) => {
    const home = fx.homeTeamId === teamId;
    const opponentId = home ? fx.awayTeamId : fx.homeTeamId;
    const opponentName = home ? fx.awayTeamName : fx.homeTeamName;
    return {
      matchId: fx.matchId,
      date: fx.date,
      competition: fx.competition,
      home,
      opponentId,
      opponentName,
      goalsFor: home ? fx.goalsHome : fx.goalsAway,
      goalsAgainst: home ? fx.goalsAway : fx.goalsHome,
      venue: fx.neutral ? "neutral" : home ? "home" : "away",
      isVsPotentialWcOpponent: potentialIds.has(opponentId),
    };
  });
}

export async function buildData(provider: DataProvider): Promise<BuildStats> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Turnierstruktur laden + index.json schreiben.
  const { tournament, groups, teams, rankByTeamId } =
    await provider.getTournament();

  const index: IndexFile = {
    tournament,
    lastUpdated: nowIso,
    groups,
    teams,
  };
  await writeJson(indexPath, IndexFile, index);

  // 2) Mögliche Gegner ableiten.
  const opponentSets = deriveOpponentSets(teams, groups, rankByTeamId);

  // 3) Historie inkrementell laden (budget-/progress-bewusst).
  const seasons = historySeasons(now, config.historyYears);
  const progress = await readProgress();
  const maxTeams = process.env.WM_MAX_TEAMS
    ? Number(process.env.WM_MAX_TEAMS)
    : Infinity;

  const stats: BuildStats = {
    teamsTotal: teams.length,
    teamsWritten: 0,
    teamsSkipped: 0,
    fixturesLoaded: 0,
    requestsUsed: 0,
    budgetExhausted: false,
  };

  for (const team of teams) {
    if (stats.teamsWritten >= maxTeams) break;
    try {
      const fixtures = await provider.getTeamFixtures(team.id, seasons);
      stats.fixturesLoaded += fixtures.length;

      const refs = opponentSets.get(team.id) ?? [];
      const potentialIds = new Set(refs.map((r) => r.teamId));
      const results = toTeamResults(team.id, fixtures, potentialIds);

      const potentialOpponents: PotentialOpponent[] = refs.map((r) => ({
        teamId: r.teamId,
        stage: r.stage,
        h2hSummary: computeH2h(team.id, r.teamId, fixtures),
      }));

      await writeJson(teamPath(team.id), Team, buildTeam(team, nowIso, results, potentialOpponents));
      progress.teamsBackfilled[team.id] = nowIso;
      stats.teamsWritten++;
    } catch (err) {
      if (err instanceof BudgetExhaustedError) {
        stats.budgetExhausted = true;
        console.warn(`[pipeline] ${err.message} — Lauf wird fortgesetzt (Rest folgt nächster Lauf).`);
        break;
      }
      throw err;
    }
  }

  await persistProgress(progress);
  stats.teamsSkipped = stats.teamsTotal - stats.teamsWritten;
  stats.requestsUsed = getRequestCount();
  return stats;
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

/**
 * Phase-1-Orchestrierung (Hybrid): Struktur/Spielplan aus dem
 * TournamentProvider (openfootball) + Historie aus dem HistoryProvider
 * (API-Football). Schreibt index.json, teams/<id>.json und matches/<id>.json
 * (zod-validiert, inkrementell, budget-bewusst).
 */
import {
  IndexFile,
  Match,
  PredictionsIndex,
  Team,
  type AccuracyAggregate,
  type NewsItem,
  type PotentialOpponent,
  type PredictionIndexEntry,
  type ScoreLine,
  type Stage,
  type TeamResult,
  type TeamSummary,
} from "@wm/shared";
import { config } from "../config.js";
import { writeJson } from "./io/json.js";
import {
  indexPath,
  matchPath,
  predictionsIndexPath,
  teamPath,
} from "./io/paths.js";
import { readProgress, writeProgress, type Progress } from "./io/cache.js";
import type {
  HistoryMatch,
  HistoryProvider,
  NormalizedFixture,
  TournamentProvider,
} from "./sources/types.js";
import { computeH2h, deriveOpponentSets } from "./features/opponents.js";
import { NewsAggregator } from "./features/news.js";
import {
  computeEloRatings,
  gamesFromHistories,
} from "./features/elo.js";
import { runEngine, featureHash } from "./features/engine.js";
import { computeForm, recencyWeight as recencyWeightFor } from "./features/form.js";

export interface BuildStats {
  teamsTotal: number;
  teamsWritten: number;
  teamsFailed: number;
  matchesWritten: number;
  historyLoaded: number;
  newsLoaded: number;
}

export interface BuildOptions {
  /** News (RSS) holen und in teams/*.json schreiben. */
  withNews: boolean;
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
  options: BuildOptions = { withNews: true },
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

  // 3) Spielplan laden (Match-Dateien werden nach der Engine geschrieben).
  const schedule = await tournamentProvider.getSchedule();
  await writePredictionsIndex(schedule, nowIso);

  const seasons = historySeasons(now, config.historyYears);
  const progress = await readProgress();
  const maxTeams = process.env.WM_MAX_TEAMS
    ? Number(process.env.WM_MAX_TEAMS)
    : Infinity;

  const stats: BuildStats = {
    teamsTotal: teams.length,
    teamsWritten: 0,
    teamsFailed: 0,
    matchesWritten: 0,
    historyLoaded: 0,
    newsLoaded: 0,
  };

  // 4) Historie aller Teams sammeln (für globale Elo-Berechnung).
  const historyByTeam = new Map<string, HistoryMatch[]>();
  const resultsByTeam = new Map<string, TeamResult[]>();
  const limitedTeams = Number.isFinite(maxTeams)
    ? teams.slice(0, maxTeams)
    : teams;

  for (const team of limitedTeams) {
    try {
      const history = await historyProvider.getTeamHistory(team, seasons);
      stats.historyLoaded += history.length;
      historyByTeam.set(team.id, history);
      const potentialIds = new Set(
        (opponentSets.get(team.id) ?? []).map((r) => r.teamId),
      );
      resultsByTeam.set(team.id, toTeamResults(history, potentialIds));
    } catch (err) {
      stats.teamsFailed++;
      console.warn(`[pipeline] Historie ${team.id} übersprungen:`, err);
    }
  }

  // 5) Globale Elo-Ratings aus der gesamten Historie.
  const eloRatings = computeEloRatings(gamesFromHistories(historyByTeam));
  const eloOf = (id: string): number =>
    eloRatings.get(id) ?? config.elo.initial;

  // 6) Teams schreiben (inkl. Form + News).
  const newsAggregator = options.withNews ? new NewsAggregator() : null;
  for (const team of limitedTeams) {
    const results = resultsByTeam.get(team.id);
    if (!results) continue; // Historie fehlgeschlagen
    try {
      const refs = opponentSets.get(team.id) ?? [];
      const potentialOpponents: PotentialOpponent[] = refs.map((r) => ({
        teamId: r.teamId,
        stage: r.stage,
        h2hSummary: computeH2h(r.teamId, historyByTeam.get(team.id) ?? []),
      }));

      let news: NewsItem[] = [];
      if (newsAggregator) {
        try {
          news = await newsAggregator.forTeam(team);
          stats.newsLoaded += news.length;
        } catch (err) {
          console.warn(`[pipeline] News für ${team.id} fehlgeschlagen:`, err);
        }
      }

      await writeJson(
        teamPath(team.id),
        Team,
        buildTeam(team, nowIso, results, potentialOpponents, news, eloOf(team.id)),
      );
      progress.teamsBackfilled[team.id] = nowIso;
      stats.teamsWritten++;
    } catch (err) {
      stats.teamsFailed++;
      console.warn(`[pipeline] Team ${team.id} übersprungen:`, err);
    }
  }

  // 7) Matches mit Engine (Feature-Bundle + Baseline) schreiben.
  stats.matchesWritten = await writeMatches(schedule, resultsByTeam, eloOf, now);

  await persistProgress(progress);
  return stats;
}

/**
 * Schreibt die Match-Dokumente. Für anstehende Partien mit bekannten Teams
 * wird das deterministische Feature-Bundle + Baseline (Phase 4) berechnet und
 * eine baseline-only Prediction (ohne KI) gesetzt; inputHash für Re-Trigger.
 */
async function writeMatches(
  schedule: NormalizedFixture[],
  resultsByTeam: Map<string, TeamResult[]>,
  eloOf: (id: string) => number,
  now: Date,
): Promise<number> {
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
      venue: {
        city: fx.ground ?? "TBD",
        neutral: fx.neutral,
        ...(fx.altitude !== undefined ? { altitude: fx.altitude } : {}),
      },
      status: fx.finished ? "finished" : "scheduled",
      actualResult,
      predictionHistory: [],
    };
    if (fx.groupId) match.groupId = fx.groupId;

    // Engine nur für anstehende Partien mit verfügbarer Historie beider Teams.
    const homeResults = resultsByTeam.get(fx.homeTeamId);
    const awayResults = resultsByTeam.get(fx.awayTeamId);
    if (!fx.finished && homeResults && awayResults) {
      const { featureBundle, baseline, mostLikelyScore } = runEngine(
        {
          homeTeamId: fx.homeTeamId,
          awayTeamId: fx.awayTeamId,
          neutral: fx.neutral,
          altitude: fx.altitude ?? null,
        },
        { teamId: fx.homeTeamId, elo: eloOf(fx.homeTeamId), results: homeResults },
        { teamId: fx.awayTeamId, elo: eloOf(fx.awayTeamId), results: awayResults },
        now,
      );
      match.featureBundle = featureBundle;
      // Baseline-only Prediction (Phase 5 ersetzt sie durch das KI-Ensemble).
      match.prediction = {
        generatedAt: now.toISOString(),
        predictedScore: mostLikelyScore,
        probabilities: baseline.probabilities,
        confidence: baselineConfidence(baseline.probabilities),
        baseline,
        inputHash: featureHash(featureBundle),
      };
    }

    await writeJson(matchPath(fx.matchId), Match, match);
    count++;
  }
  return count;
}

/** Grobes Konfidenzmaß aus der Verteilung (max-Wahrscheinlichkeit, skaliert). */
function baselineConfidence(p: {
  home: number;
  draw: number;
  away: number;
}): number {
  const max = Math.max(p.home, p.draw, p.away);
  // 0.33 (max. Unsicherheit) → 0, 1.0 → 1; linear, gekappt.
  return Math.max(0, Math.min(1, (max - 1 / 3) / (1 - 1 / 3)));
}

/** Schreibt predictions-index.json (leichte Match-Liste für die App). */
async function writePredictionsIndex(
  schedule: NormalizedFixture[],
  nowIso: string,
): Promise<void> {
  const entries: PredictionIndexEntry[] = schedule
    .map((fx) => {
      const actualResult: ScoreLine | null =
        fx.finished && fx.goalsHome !== null && fx.goalsAway !== null
          ? { home: fx.goalsHome, away: fx.goalsAway }
          : null;
      return {
        matchId: fx.matchId,
        date: fx.dateTime ?? `${fx.date}T00:00:00Z`,
        stage: fx.stage ?? "group",
        homeTeamId: fx.homeTeamId,
        awayTeamId: fx.awayTeamId,
        actualResult,
      } satisfies PredictionIndexEntry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const aggregate: AccuracyAggregate = {
    finishedCount: entries.filter((e) => e.actualResult !== null).length,
    exactScoreRate: null,
    outcomeRate: null,
    brierMean: null,
    rpsMean: null,
  };

  await writeJson(predictionsIndexPath, PredictionsIndex, {
    lastUpdated: nowIso,
    aggregate,
    entries,
  });
}

/** Baut das Team-Dokument; optionale Felder werden bewusst weggelassen. */
function buildTeam(
  summary: TeamSummary,
  lastUpdated: string,
  results: TeamResult[],
  potentialOpponents: PotentialOpponent[],
  news: NewsItem[],
  elo: number,
): Team {
  const now = new Date(lastUpdated);
  const f = computeForm(results, now);
  // recencyWeight pro Ergebnis annotieren (für die UI / Transparenz).
  const annotated: TeamResult[] = results.map((r) => ({
    ...r,
    recencyWeight: round3(recencyWeightFor(r.date, now)),
  }));

  const team: Team = {
    id: summary.id,
    name: summary.name,
    code: summary.code,
    groupId: summary.groupId,
    elo: Math.round(elo),
    lastUpdated,
    results: annotated,
    form: {
      last10Points: Math.round(f.recentForm * config.formWindow),
      weightedForm: round3(f.weightedForm),
      goalsForAvg: round3(f.goalsForAvg),
      goalsAgainstAvg: round3(f.goalsAgainstAvg),
      cleanSheetRate: round3(f.cleanSheetRate),
    },
    potentialOpponents,
    news,
  };
  if (summary.logo) team.logo = summary.logo;
  return team;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

async function persistProgress(progress: Progress): Promise<void> {
  await writeProgress(progress);
}

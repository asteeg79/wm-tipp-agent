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
  type AccuracyEntry,
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
import { ELO_SEED } from "./features/eloSeed.js";
import { runEngine, featureHash } from "./features/engine.js";
import { computeForm, recencyWeight as recencyWeightFor } from "./features/form.js";
import { makeEnsemble, type Ensemble } from "./predict/index.js";
import { decideRetrigger } from "./predict/retrigger.js";
import { readJsonOptional } from "./io/json.js";
import { aggregateAccuracy, scoreMatch } from "./features/accuracy.js";

export interface BuildStats {
  teamsTotal: number;
  teamsWritten: number;
  teamsFailed: number;
  matchesWritten: number;
  historyLoaded: number;
  newsLoaded: number;
  aiEvaluated: number;
  aiSkipped: number;
  accuracyScored: number;
}

export interface BuildOptions {
  /** News (RSS) holen und in teams/*.json schreiben. */
  withNews: boolean;
  /** KI-Ensemble für anstehende Partien ausführen (Phase 5). */
  withAi: boolean;
  /**
   * KI nur für Partien mit Anpfiff innerhalb dieses Fensters (Stunden ab jetzt)
   * bewerten — Kostensteuerung. null/undefined = kein Fenster-Limit.
   * Spiele außerhalb behalten ihren letzten Tipp (oder Baseline).
   */
  aiWindowHours?: number | null;
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
  options: BuildOptions = { withNews: true, withAi: true },
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
    aiEvaluated: 0,
    aiSkipped: 0,
    accuracyScored: 0,
  };

  // 4) Historie aller Teams sammeln (für globale Elo-Berechnung).
  const historyByTeam = new Map<string, HistoryMatch[]>();
  const resultsByTeam = new Map<string, TeamResult[]>();
  const newsByTeam = new Map<string, NewsItem[]>();
  const nameById = new Map<string, string>();
  for (const t of teams) nameById.set(t.id, t.name);
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

  // 5) Globale Elo-Ratings aus der gesamten Historie (FIFA-Seed als Startwert).
  const eloRatings = computeEloRatings(gamesFromHistories(historyByTeam));
  // Fallback für Teams ganz ohne Historie: Seed, sonst config.elo.initial.
  const eloOf = (id: string): number =>
    eloRatings.get(id) ?? ELO_SEED[id] ?? config.elo.initial;

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
      newsByTeam.set(team.id, news);

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

  // 7) Matches mit Engine (Feature-Bundle + Baseline) + optional KI-Ensemble.
  const ensemble = options.withAi ? makeEnsemble() : null;
  if (ensemble && !ensemble.active) {
    console.warn(
      "[pipeline] Kein KI-Key gesetzt → nur Baseline (graceful degradation).",
    );
  } else if (ensemble) {
    console.log(`[pipeline] KI-Ensemble aktiv: ${ensemble.modelIds.join(", ")}`);
  }

  const matchResult = await writeMatches(schedule, {
    resultsByTeam,
    newsByTeam,
    nameById,
    eloOf,
    now,
    ensemble: ensemble && ensemble.active ? ensemble : null,
    aiWindowHours: options.aiWindowHours ?? null,
  });
  stats.matchesWritten = matchResult.written;
  stats.aiEvaluated = matchResult.aiEvaluated;
  stats.aiSkipped = matchResult.aiSkipped;

  // 8) predictions-index.json inkl. Accuracy nach Spielende.
  stats.accuracyScored = await writePredictionsIndex(matchResult.matches, nowIso);

  await persistProgress(progress);
  return stats;
}

interface WriteMatchesCtx {
  resultsByTeam: Map<string, TeamResult[]>;
  newsByTeam: Map<string, NewsItem[]>;
  nameById: Map<string, string>;
  eloOf: (id: string) => number;
  now: Date;
  ensemble: Ensemble | null;
  /** KI nur für Partien ≤ diesem Anpfiff-Fenster (Std.); null = unbegrenzt. */
  aiWindowHours: number | null;
}

interface WriteMatchesResult {
  written: number;
  aiEvaluated: number;
  aiSkipped: number;
  /** Alle geschriebenen Matches (für predictions-index + Accuracy). */
  matches: Match[];
}

/**
 * Schreibt die Match-Dokumente. Für anstehende Partien mit bekannter Historie:
 * Feature-Bundle + Baseline (Phase 4); falls KI-Ensemble aktiv und Re-Trigger
 * greift, wird der KI-Tipp berechnet (alter Tipp → predictionHistory).
 * Inkrementell: bestehende matches/*.json werden gelesen, um Re-Trigger und
 * Historie zu bewahren.
 */
async function writeMatches(
  schedule: NormalizedFixture[],
  ctx: WriteMatchesCtx,
): Promise<WriteMatchesResult> {
  const { resultsByTeam, newsByTeam, nameById, eloOf, now, ensemble } = ctx;
  let written = 0;
  let aiEvaluated = 0;
  let aiSkipped = 0;
  const matches: Match[] = [];
  const MS_PER_HOUR = 3_600_000;

  for (const fx of schedule) {
    const stage: Stage = fx.stage ?? "group";
    const actualResult: ScoreLine | null =
      fx.finished && fx.goalsHome !== null && fx.goalsAway !== null
        ? { home: fx.goalsHome, away: fx.goalsAway }
        : null;

    // Bestehendes Match laden (für Re-Trigger + predictionHistory + Tipp).
    const prev = await readJsonOptional<Match>(matchPath(fx.matchId), Match);

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
      predictionHistory: prev?.predictionHistory ?? [],
    };
    if (fx.groupId) match.groupId = fx.groupId;

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
      const inputHash = featureHash(featureBundle);

      // Baseline-Prediction als Default.
      const baselinePrediction = {
        generatedAt: now.toISOString(),
        predictedScore: mostLikelyScore,
        probabilities: baseline.probabilities,
        confidence: baselineConfidence(baseline.probabilities),
        baseline,
        inputHash,
      };

      const homeNews = newsByTeam.get(fx.homeTeamId) ?? [];
      const awayNews = newsByTeam.get(fx.awayTeamId) ?? [];

      // Kosten-Gate: KI nur für Partien im Anpfiff-Fenster (z. B. ≤72 h).
      // Außerhalb → kein KI-Call, Tipp/Baseline bleibt unverändert.
      const hoursUntilKickoff =
        (new Date(match.date).getTime() - now.getTime()) / MS_PER_HOUR;
      const inAiWindow =
        ctx.aiWindowHours === null ||
        (hoursUntilKickoff >= 0 && hoursUntilKickoff <= ctx.aiWindowHours);

      if (ensemble && inAiWindow) {
        const decision = decideRetrigger(
          prev ?? match,
          inputHash,
          homeNews,
          awayNews,
          now,
        );
        if (decision.shouldEvaluate) {
          try {
            const aiPred = await ensemble.evaluate({
              homeName: nameById.get(fx.homeTeamId) ?? fx.homeTeamId,
              awayName: nameById.get(fx.awayTeamId) ?? fx.awayTeamId,
              featureBundle,
              baseline,
              homeNews,
              awayNews,
              inputHash,
              now,
            });
            // Alten KI-Tipp in die Historie schieben.
            if (prev?.prediction?.models) {
              match.predictionHistory = [
                ...match.predictionHistory,
                {
                  generatedAt: prev.prediction.generatedAt,
                  predictedScore: prev.prediction.predictedScore,
                  probabilities: prev.prediction.probabilities,
                  confidence: prev.prediction.confidence,
                },
              ];
            }
            match.prediction = aiPred;
            aiEvaluated++;
          } catch (err) {
            console.warn(`[predict] ${fx.matchId} KI fehlgeschlagen:`, err);
            match.prediction = prev?.prediction ?? baselinePrediction;
            aiSkipped++;
          }
        } else {
          // Unverändert → vorhandenen Tipp behalten, sonst Baseline.
          match.prediction = prev?.prediction ?? baselinePrediction;
          aiSkipped++;
        }
      } else {
        // Kein Ensemble, außerhalb Anpfiff-Fenster oder kein Key:
        // vorhandenen (KI-)Tipp behalten, sonst Baseline. Kein KI-Call.
        match.prediction = prev?.prediction ?? baselinePrediction;
        if (ensemble && !inAiWindow) aiSkipped++;
      }
    } else if (fx.finished && prev?.prediction) {
      // Beendete Partie: letzten Tipp bewahren (für Accuracy + Anzeige).
      match.prediction = prev.prediction;
      if (prev.featureBundle) match.featureBundle = prev.featureBundle;
    }

    await writeJson(matchPath(fx.matchId), Match, match);
    matches.push(match);
    written++;
  }
  return { written, aiEvaluated, aiSkipped, matches };
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

/**
 * Schreibt predictions-index.json (leichte Match-Liste für die App) inkl.
 * Accuracy je beendeter Partie (Brier/RPS/Trefferquoten) + Aggregate.
 * Gibt die Anzahl bewerteter (beendeter) Partien zurück.
 */
async function writePredictionsIndex(
  matches: Match[],
  nowIso: string,
): Promise<number> {
  const entries: PredictionIndexEntry[] = matches
    .map((m) => {
      const pred = m.prediction;
      const entry: PredictionIndexEntry = {
        matchId: m.id,
        date: m.date,
        stage: m.stage,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        actualResult: m.actualResult,
      };
      if (pred) {
        entry.predictedScore = pred.predictedScore;
        entry.probabilities = pred.probabilities;
        entry.confidence = pred.confidence;
      }
      // Accuracy nur für beendete Partien mit Tipp.
      if (m.actualResult && pred) {
        entry.accuracy = scoreMatch(
          pred.predictedScore,
          pred.probabilities,
          m.actualResult,
        );
      }
      return entry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const aggregate = aggregateAccuracy(
    entries.map((e) => {
      const base: { accuracy?: AccuracyEntry; actualResult: ScoreLine | null } =
        { actualResult: e.actualResult };
      if (e.accuracy) base.accuracy = e.accuracy;
      return base;
    }),
  );

  await writeJson(predictionsIndexPath, PredictionsIndex, {
    lastUpdated: nowIso,
    aggregate,
    entries,
  });
  return aggregate.finishedCount;
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

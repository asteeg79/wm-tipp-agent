/**
 * Backtest der deterministischen Baseline-Engine (Abschnitt 17).
 *
 * Walk-Forward: Spiele chronologisch durchlaufen. Für jedes Spiel werden
 *  - Elo-Ratings NUR aus den davor liegenden Spielen,
 *  - Form NUR aus den davor liegenden Spielen jedes Teams
 * berechnet, dann eine Poisson-Baseline-Prognose erstellt und gegen das
 * tatsächliche Ergebnis gescort (Brier/RPS/Trefferquoten). So gibt es keinen
 * Look-ahead-Bias. Parameter (H, alpha, K, eloToGoalsScale) sind überschreibbar
 * → Parameter-Sweep zum Tunen.
 */
import type { TeamResult } from "@wm/shared";
import { config, type PipelineConfig } from "../../config.js";
import { computeForm } from "../features/form.js";
import { expectedScore } from "../features/elo.js";
import { ELO_SEED } from "../features/eloSeed.js";
import { estimateLambdas, poissonBaseline } from "../features/poisson.js";
import { isEuropean, isMajorNation } from "../features/confederation.js";
import { scoreMatch, aggregateAccuracy } from "../features/accuracy.js";
import type { BacktestGame } from "../sources/openFootballHistory.js";

/** Überschreibbare Engine-Parameter für einen Backtest-Durchlauf. */
export interface BacktestParams {
  decayHalfLifeDays: number;
  opponentHighlightWeight: number;
  formWindow: number;
  eloK: number;
  eloInitial: number;
  eloToGoalsScale: number;
  /** FIFA-Seed als Elo-Startwert nutzen (statt überall eloInitial). */
  useSeed: boolean;
}

export function paramsFromConfig(c: PipelineConfig): BacktestParams {
  return {
    decayHalfLifeDays: c.decayHalfLifeDays,
    opponentHighlightWeight: c.opponentHighlightWeight,
    formWindow: c.formWindow,
    eloK: c.elo.k,
    eloInitial: c.elo.initial,
    eloToGoalsScale: c.poisson.eloToGoalsScale,
    useSeed: true,
  };
}

export interface BacktestResult {
  params: BacktestParams;
  /** Anzahl bewerteter Spiele (nach Warmup). */
  scored: number;
  exactScoreRate: number | null;
  outcomeRate: number | null;
  brierMean: number | null;
  rpsMean: number | null;
  /** Korrelation vorhergesagte vs. echte Tordifferenz (GS-Hauptvalidierung). */
  goalDiffCorr: number | null;
}

/** Pearson-Korrelation zweier gleich langer Zahlenreihen. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom === 0 ? null : sxy / denom;
}

/** Tordifferenz-Multiplikator (wie features/elo.ts). */
function goalMultiplier(goalDiff: number): number {
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/** Wandelt vergangene Spiele eines Teams in TeamResult[] (für computeForm). */
function toResults(teamId: string, games: BacktestGame[]): TeamResult[] {
  return games.map((g) => {
    const home = g.homeId === teamId;
    return {
      matchId: g.matchId,
      date: g.date,
      competition: g.competition,
      home,
      opponentId: home ? g.awayId : g.homeId,
      opponentName: home ? g.awayName : g.homeName,
      goalsFor: home ? g.goalsHome : g.goalsAway,
      goalsAgainst: home ? g.goalsAway : g.goalsHome,
      venue: "neutral" as const,
      isVsPotentialWcOpponent: false,
    };
  });
}

/**
 * Führt einen Walk-Forward-Backtest aus.
 * @param games  chronologisch sortierte Länderspiele
 * @param params Engine-Parameter
 * @param warmup Mindestanzahl Spiele/Team, bevor gescort wird (Datenbasis)
 */
export function runBacktest(
  games: BacktestGame[],
  params: BacktestParams,
  warmup = 5,
): BacktestResult {
  // config temporär mit den Backtest-Parametern überschreiben, da die
  // Engine-Funktionen aus der globalen config lesen.
  const saved = JSON.parse(
    JSON.stringify({
      decayHalfLifeDays: config.decayHalfLifeDays,
      opponentHighlightWeight: config.opponentHighlightWeight,
      formWindow: config.formWindow,
      eloK: config.elo.k,
      eloInitial: config.elo.initial,
      eloToGoalsScale: config.poisson.eloToGoalsScale,
    }),
  );
  config.decayHalfLifeDays = params.decayHalfLifeDays;
  config.opponentHighlightWeight = params.opponentHighlightWeight;
  config.formWindow = params.formWindow;
  config.elo.k = params.eloK;
  config.elo.initial = params.eloInitial;
  config.poisson.eloToGoalsScale = params.eloToGoalsScale;

  try {
    const elo = new Map<string, number>();
    const history = new Map<string, BacktestGame[]>();
    const seedOf = (id: string): number =>
      params.useSeed ? (ELO_SEED[id] ?? params.eloInitial) : params.eloInitial;
    const getElo = (id: string): number => elo.get(id) ?? seedOf(id);
    const push = (id: string, g: BacktestGame): void => {
      if (!history.has(id)) history.set(id, []);
      history.get(id)!.push(g);
    };

    const entries: {
      accuracy: ReturnType<typeof scoreMatch>;
      actualResult: { home: number; away: number };
    }[] = [];
    // Für die GS-artige Korrelations-Metrik: vorhergesagte vs. echte Tordiff.
    const predDiff: number[] = [];
    const actualDiff: number[] = [];

    for (const g of games) {
      const homeHist = history.get(g.homeId) ?? [];
      const awayHist = history.get(g.awayId) ?? [];

      // Nur scoren, wenn beide Teams genug Vorgeschichte haben (Warmup).
      if (homeHist.length >= warmup && awayHist.length >= warmup) {
        const now = new Date(g.date);
        const homeForm = computeForm(toResults(g.homeId, homeHist), now);
        const awayForm = computeForm(toResults(g.awayId, awayHist), now);
        const eloDiff = getElo(g.homeId) - getElo(g.awayId);
        const lambdas = estimateLambdas(eloDiff, homeForm, awayForm, null, {
          homeId: g.homeId,
          awayId: g.awayId,
          homeEuropean: isEuropean(g.homeId),
          awayEuropean: isEuropean(g.awayId),
          homeMajor: isMajorNation(g.homeId),
          awayMajor: isMajorNation(g.awayId),
        });
        const base = poissonBaseline(lambdas.home, lambdas.away);
        const actual = { home: g.goalsHome, away: g.goalsAway };
        entries.push({
          accuracy: scoreMatch(
            base.mostLikelyScore,
            base.probabilities,
            actual,
          ),
          actualResult: actual,
        });
        // erwartete Tordifferenz = λ_home − λ_away (GS-Trainingsziel).
        predDiff.push(lambdas.home - lambdas.away);
        actualDiff.push(g.goalsHome - g.goalsAway);
      }

      // Elo nach dem Spiel updaten (Walk-Forward).
      const ra = getElo(g.homeId);
      const rb = getElo(g.awayId);
      const ea = expectedScore(ra, rb);
      let wa: number;
      if (g.goalsHome > g.goalsAway) wa = 1;
      else if (g.goalsHome === g.goalsAway) wa = 0.5;
      else wa = 0;
      const k = params.eloK * goalMultiplier(g.goalsHome - g.goalsAway);
      elo.set(g.homeId, ra + k * (wa - ea));
      elo.set(g.awayId, rb + k * (1 - wa - (1 - ea)));

      push(g.homeId, g);
      push(g.awayId, g);
    }

    const agg = aggregateAccuracy(entries);
    return {
      params,
      scored: agg.finishedCount,
      exactScoreRate: agg.exactScoreRate,
      outcomeRate: agg.outcomeRate,
      brierMean: agg.brierMean,
      rpsMean: agg.rpsMean,
      goalDiffCorr: pearson(predDiff, actualDiff),
    };
  } finally {
    config.decayHalfLifeDays = saved.decayHalfLifeDays;
    config.opponentHighlightWeight = saved.opponentHighlightWeight;
    config.formWindow = saved.formWindow;
    config.elo.k = saved.eloK;
    config.elo.initial = saved.eloInitial;
    config.poisson.eloToGoalsScale = saved.eloToGoalsScale;
  }
}

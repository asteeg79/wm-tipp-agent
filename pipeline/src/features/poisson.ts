/**
 * Poisson-Baseline (Abschnitt 11.2 / 11.4): schätzt erwartete Tore
 * λ_home/λ_away aus Elo-Differenz, Angriffs-/Abwehrstärke (Form) und
 * Heimvorteil, bildet die Score-Matrix und leitet 1X2-Wahrscheinlichkeiten
 * + das wahrscheinlichste plausible Ergebnis ab. Rein deterministisch.
 */
import { config } from "../../config.js";
import type { FormMetrics } from "./form.js";

export interface BaselineResult {
  expectedGoals: { home: number; away: number };
  probabilities: { home: number; draw: number; away: number };
  mostLikelyScore: { home: number; away: number };
}

/** Poisson-PMF: P(X=k) für Erwartungswert λ. */
function poissonPmf(k: number, lambda: number): number {
  return (lambda ** k * Math.exp(-lambda)) / factorial(k);
}

const FACT: number[] = [1];
function factorial(n: number): number {
  for (let i = FACT.length; i <= n; i++) FACT[i] = FACT[i - 1]! * i;
  return FACT[n]!;
}

/**
 * Schätzt λ aus Elo-Differenz, Form (Tore für/gegen) und Heimvorteil.
 * @param eloDiff  Elo(Heim) − Elo(Auswärts), inkl. HFA falls Gastgeber.
 */
/** Optionale Team-Kontextinfos für die Mentalitäts-/Konföderations-Faktoren. */
export interface LambdaContext {
  homeId?: string;
  awayId?: string;
  /** Ist das Team aus der UEFA (Europa)? */
  homeEuropean?: boolean;
  awayEuropean?: boolean;
  /** Etablierte Top-Nation? */
  homeMajor?: boolean;
  awayMajor?: boolean;
}

export function estimateLambdas(
  eloDiff: number,
  homeForm: FormMetrics,
  awayForm: FormMetrics,
  hostIsHome: boolean | null,
  ctx: LambdaContext = {},
): { home: number; away: number } {
  const avg = config.poisson.leagueAvgGoals;

  // Angriffs-/Abwehrstärke relativ zum Liga-Schnitt (aus gewichteter Form).
  // Fallback auf Liga-Schnitt, wenn keine Historie vorhanden ist.
  const homeAtt = homeForm.matchesCount > 0 ? homeForm.goalsForAvg : avg;
  const homeDef = homeForm.matchesCount > 0 ? homeForm.goalsAgainstAvg : avg;
  const awayAtt = awayForm.matchesCount > 0 ? awayForm.goalsForAvg : avg;
  const awayDef = awayForm.matchesCount > 0 ? awayForm.goalsAgainstAvg : avg;

  // Asymmetrisches Momentum (GS-inspiriert): Angriff = eigene erzielte Tore
  // (letzte N) gemischt mit kassierten Toren des Gegners (letzte M).
  const mw = config.poisson.momentumWeight;
  const homeMomentum = (homeForm.scoredRecent + awayForm.concededRecent) / 2;
  const awayMomentum = (awayForm.scoredRecent + homeForm.concededRecent) / 2;

  // Basis: gemittelte Angriffsstärke × Abwehrschwäche, gemischt mit Momentum.
  let lambdaHome = (1 - mw) * ((homeAtt + awayDef) / 2) + mw * homeMomentum;
  let lambdaAway = (1 - mw) * ((awayAtt + homeDef) / 2) + mw * awayMomentum;

  // Elo-Differenz multiplikativ einrechnen (stärkeres Team skaliert hoch).
  const eloFactor = Math.exp(config.poisson.eloToGoalsScale * eloDiff);
  lambdaHome *= eloFactor;
  lambdaAway /= eloFactor;

  // Heimvorteil (nur Gastgeber-Nation, sonst neutraler Platz).
  if (hostIsHome === true) {
    lambdaHome *= 1.1;
    lambdaAway *= 0.95;
  }

  // --- Mentalitäts-/Konföderations-Faktoren (GS-inspiriert) ---
  const f = config.factors;
  // Winner's Slump: Titelverteidiger erzielt etwas weniger.
  if (ctx.homeId === f.defendingChampionId) lambdaHome *= f.winnersSlump;
  if (ctx.awayId === f.defendingChampionId) lambdaAway *= f.winnersSlump;
  // Schwerer, gegen europäische Teams zu treffen → Gegner-λ sinkt.
  if (ctx.awayEuropean) lambdaHome *= f.vsEuropeanDefenseBonus;
  if (ctx.homeEuropean) lambdaAway *= f.vsEuropeanDefenseBonus;
  // Top-Nation-Boost.
  if (ctx.homeMajor) lambdaHome *= f.majorNationBoost;
  if (ctx.awayMajor) lambdaAway *= f.majorNationBoost;

  // Plausibilitätsgrenzen.
  lambdaHome = clamp(lambdaHome, 0.2, 4.5);
  lambdaAway = clamp(lambdaAway, 0.2, 4.5);
  return { home: lambdaHome, away: lambdaAway };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Baut die Score-Matrix und leitet 1X2 + wahrscheinlichstes Ergebnis ab. */
export function poissonBaseline(
  lambdaHome: number,
  lambdaAway: number,
): BaselineResult {
  const max = config.poisson.maxGoals;
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  const homePmf: number[] = [];
  const awayPmf: number[] = [];
  for (let i = 0; i <= max; i++) {
    homePmf[i] = poissonPmf(i, lambdaHome);
    awayPmf[i] = poissonPmf(i, lambdaAway);
  }

  // Bestes Einzelergebnis je 1X2-Kategorie merken.
  let bestHome = { score: { home: 1, away: 0 }, p: -1 };
  let bestDraw = { score: { home: 0, away: 0 }, p: -1 };
  let bestAway = { score: { home: 0, away: 1 }, p: -1 };

  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = homePmf[h]! * awayPmf[a]!;
      if (h > a) {
        pHome += p;
        if (p > bestHome.p) bestHome = { score: { home: h, away: a }, p };
      } else if (h === a) {
        pDraw += p;
        if (p > bestDraw.p) bestDraw = { score: { home: h, away: a }, p };
      } else {
        pAway += p;
        if (p > bestAway.p) bestAway = { score: { home: h, away: a }, p };
      }
    }
  }

  // Renormieren (abgeschnittene Matrix → Summe leicht < 1).
  const sum = pHome + pDraw + pAway;
  const probs = { home: pHome / sum, draw: pDraw / sum, away: pAway / sum };

  // predictedScore = bestes Ergebnis im wahrscheinlichsten Ausgang (konsistent
  // mit 1X2 statt global wahrscheinlichstem Einzelergebnis, das Remis überbewertet).
  const maxOutcome = Math.max(probs.home, probs.draw, probs.away);
  const mostLikelyScore =
    maxOutcome === probs.home
      ? bestHome.score
      : maxOutcome === probs.away
        ? bestAway.score
        : bestDraw.score;

  return {
    expectedGoals: { home: round2(lambdaHome), away: round2(lambdaAway) },
    probabilities: {
      home: round4(probs.home),
      draw: round4(probs.draw),
      away: round4(probs.away),
    },
    mostLikelyScore,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

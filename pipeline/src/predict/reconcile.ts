/**
 * Reconciliation (Abschnitt 11.4): fügt die Einzelantworten beider Modelle
 * (+ Baseline als Fallback) zu einem finalen Tipp zusammen.
 *  - finale Wahrscheinlichkeiten = (konfidenz-gewichteter) Mittelwert, renormiert
 *  - finaler Score aus dem Modell mit höherer Konfidenz / Mehrheit
 *  - agreement = 1 − mittlere abs. Differenz der Wahrscheinlichkeiten
 *  - rationale = regelbasierte Prosa-Synthese aus keyFactors
 */
import type {
  Baseline,
  ModelPrediction,
  Outcome1x2,
  Prediction,
  ScoreLine,
} from "@wm/shared";
import { config } from "../../config.js";
import { normalizeProbs, type LlmPrediction } from "./schema.js";

export interface ModelResult {
  id: "claude" | "chatgpt";
  prediction: LlmPrediction;
}

export interface ReconcileOutput {
  probabilities: Outcome1x2;
  predictedScore: ScoreLine;
  confidence: number;
  agreement: number;
  rationale: string;
  models: { claude?: ModelPrediction; chatgpt?: ModelPrediction };
}

function toModelPrediction(p: LlmPrediction): ModelPrediction {
  return {
    predictedScore: p.predictedScore,
    probabilities: normalizeProbs(p.probabilities),
    confidence: p.confidence,
    keyFactors: p.keyFactors,
    risks: p.risks,
  };
}

/** Übereinstimmung 0..1 aus mittlerer abs. Differenz der 1X2-Wahrscheinlichkeiten. */
function agreementOf(a: Outcome1x2, b: Outcome1x2): number {
  const mad =
    (Math.abs(a.home - b.home) +
      Math.abs(a.draw - b.draw) +
      Math.abs(a.away - b.away)) /
    3;
  return Math.max(0, Math.min(1, 1 - mad));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/**
 * Führt die Modellergebnisse zusammen. Mit beiden Modellen: Ensemble.
 * Mit nur einem Modell: dessen Ergebnis. Mit keinem: Baseline-Fallback.
 */
export function reconcile(
  results: ModelResult[],
  baseline: Baseline,
  now: Date,
  inputHash: string,
): Prediction {
  const models: { claude?: ModelPrediction; chatgpt?: ModelPrediction } = {};
  for (const r of results) models[r.id] = toModelPrediction(r.prediction);

  // Kein Modell verfügbar → Baseline unverändert übernehmen.
  if (results.length === 0) {
    return {
      generatedAt: now.toISOString(),
      predictedScore: scoreFromProbs(baseline.probabilities, baseline),
      probabilities: baseline.probabilities,
      confidence: confidenceFromProbs(baseline.probabilities),
      baseline,
      rationale:
        "Kein KI-Modell verfügbar — deterministische Baseline (Elo+Poisson).",
      inputHash,
    };
  }

  const weighted = config.ensemble.confidenceWeighted;
  let wSum = 0;
  const acc = { home: 0, draw: 0, away: 0 };
  for (const r of results) {
    const p = normalizeProbs(r.prediction.probabilities);
    const w = weighted ? Math.max(0.01, r.prediction.confidence) : 1;
    acc.home += w * p.home;
    acc.draw += w * p.draw;
    acc.away += w * p.away;
    wSum += w;
  }
  const probabilities: Outcome1x2 = {
    home: round4(acc.home / wSum),
    draw: round4(acc.draw / wSum),
    away: round4(acc.away / wSum),
  };

  // Finaler Score: vom Modell mit höherer Konfidenz, aber konsistent zum
  // wahrscheinlichsten Ausgang gemacht.
  const top = results
    .slice()
    .sort((a, b) => b.prediction.confidence - a.prediction.confidence)[0]!;
  const predictedScore = makeConsistent(
    top.prediction.predictedScore,
    probabilities,
  );

  // agreement nur sinnvoll bei zwei Modellen.
  const agreement =
    results.length === 2
      ? agreementOf(
          normalizeProbs(results[0]!.prediction.probabilities),
          normalizeProbs(results[1]!.prediction.probabilities),
        )
      : 1;

  // Konfidenz: Mittelwert der Modell-Konfidenzen, bei Uneinigkeit gedämpft.
  const meanConf =
    results.reduce((s, r) => s + r.prediction.confidence, 0) / results.length;
  const confidence = round4(Math.max(0, Math.min(1, meanConf * (0.5 + 0.5 * agreement))));

  return {
    generatedAt: now.toISOString(),
    predictedScore,
    probabilities,
    confidence,
    baseline,
    models,
    agreement: round4(agreement),
    rationale: buildRationale(results, agreement),
    inputHash,
  };
}

/** Macht einen Score konsistent zum wahrscheinlichsten 1X2-Ausgang. */
function makeConsistent(score: ScoreLine, p: Outcome1x2): ScoreLine {
  const top = Math.max(p.home, p.draw, p.away);
  const sH = score.home;
  const sA = score.away;
  if (top === p.home && sH > sA) return score;
  if (top === p.away && sA > sH) return score;
  if (top === p.draw && sH === sA) return score;
  // sonst aus der Verteilung ableiten
  return scoreFromProbs(p, undefined);
}

/** Plausibler Score passend zum Top-Ausgang (Fallback). */
function scoreFromProbs(p: Outcome1x2, baseline?: Baseline): ScoreLine {
  const top = Math.max(p.home, p.draw, p.away);
  if (baseline) {
    const eg = baseline.expectedGoals;
    const h = Math.max(0, Math.round(eg.home));
    const a = Math.max(0, Math.round(eg.away));
    if (top === p.home) return { home: Math.max(h, a + 1), away: Math.min(a, h - 1 < 0 ? 0 : h - 1) };
    if (top === p.away) return { home: Math.min(h, a - 1 < 0 ? 0 : a - 1), away: Math.max(a, h + 1) };
    return { home: Math.max(h, a), away: Math.max(h, a) };
  }
  if (top === p.home) return { home: 2, away: 1 };
  if (top === p.away) return { home: 1, away: 2 };
  return { home: 1, away: 1 };
}

function confidenceFromProbs(p: Outcome1x2): number {
  const max = Math.max(p.home, p.draw, p.away);
  return round4(Math.max(0, Math.min(1, (max - 1 / 3) / (1 - 1 / 3))));
}

/** Regelbasierte Prosa-Synthese aus den keyFactors beider Modelle. */
function buildRationale(results: ModelResult[], agreement: number): string {
  const factors = new Set<string>();
  for (const r of results) for (const f of r.prediction.keyFactors) factors.add(f);
  const topFactors = [...factors].slice(0, 3);
  const accord =
    results.length === 2
      ? agreement >= 0.8
        ? "Beide Modelle sind sich weitgehend einig."
        : "Die Modelle sind uneinig — Konfidenz entsprechend gedämpft."
      : "Einschätzung auf Basis eines Modells.";
  const why = topFactors.length
    ? ` Ausschlaggebend: ${topFactors.join("; ")}.`
    : "";
  return `${accord}${why}`;
}

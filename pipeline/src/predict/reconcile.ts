/**
 * Reconciliation (Abschnitt 11.4): fügt die Einzelantworten beider Modelle
 * (+ Baseline als Fallback) zu einem finalen Tipp zusammen.
 *  - finale Wahrscheinlichkeiten = (konfidenz-gewichteter) Mittelwert, renormiert
 *  - finaler Score aus dem Modell mit höherer Konfidenz / Mehrheit
 *  - agreement = 1 − mittlere abs. Differenz der Wahrscheinlichkeiten
 *  - rationale = regelbasierte Prosa-Synthese aus keyFactors
 */
import {
  outcomeOf,
  type Baseline,
  type ModelPrediction,
  type Outcome1x2,
  type OutcomeKey,
  type Prediction,
  type ScoreLine,
} from "@wm/shared";
import { confidenceFromProbs, round } from "../util/math.js";
import { config } from "../../config.js";
import { normalizeProbs, type LlmPrediction } from "./schema.js";
import type { EnsembleWeights } from "./ensembleWeights.js";

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

/**
 * Führt die Modellergebnisse zusammen. Mit beiden Modellen: Ensemble.
 * Mit nur einem Modell: dessen Ergebnis. Mit keinem: Baseline-Fallback.
 *
 * @param accWeights optionale Accuracy-Gewichte (computeModelWeights): das
 *        bisher treffsicherere Modell bekommt mehr Einfluss auf
 *        Wahrscheinlichkeiten und Score-Wahl.
 */
export function reconcile(
  results: ModelResult[],
  baseline: Baseline,
  now: Date,
  inputHash: string,
  accWeights?: EnsembleWeights | null,
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
  // Accuracy-Gewichtung nur anwenden, wenn wirklich BEIDE Modelle antworten —
  // bei nur einem Modell würde sie dessen Tipp grundlos skalieren.
  const useAcc = !!accWeights && results.length === 2;
  let wSum = 0;
  const acc = { home: 0, draw: 0, away: 0 };
  for (const r of results) {
    const p = normalizeProbs(r.prediction.probabilities);
    let w = weighted ? Math.max(0.01, r.prediction.confidence) : 1;
    if (useAcc) w *= accWeights!.weights[r.id];
    acc.home += w * p.home;
    acc.draw += w * p.draw;
    acc.away += w * p.away;
    wSum += w;
  }
  const probabilities: Outcome1x2 = {
    home: round(acc.home / wSum, 4),
    draw: round(acc.draw / wSum, 4),
    away: round(acc.away / wSum, 4),
  };

  // Finaler Score (siehe deriveScore): Modell-Konsens vor knappem Top-Ausgang,
  // Magnitude aus der xG-Baseline statt hartkodiert.
  const predictedScore = deriveScore(
    results,
    probabilities,
    baseline,
    useAcc ? accWeights : null,
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
  const confidence = round(
    Math.max(0, Math.min(1, meanConf * (0.5 + 0.5 * agreement))),
    4,
  );

  const prediction: Prediction = {
    generatedAt: now.toISOString(),
    predictedScore,
    probabilities,
    confidence,
    baseline,
    models,
    agreement: round(agreement, 4),
    rationale: buildRationale(results, agreement, useAcc ? accWeights : null),
    inputHash,
  };
  if (useAcc) prediction.ensembleWeights = accWeights!.weights;
  return prediction;
}

/** Top-1X2-Ausgang + Vorsprung zum zweitwahrscheinlichsten. */
function topOutcome(p: Outcome1x2): { key: OutcomeKey; margin: number } {
  const arr: Array<[OutcomeKey, number]> = [
    ["home", p.home],
    ["draw", p.draw],
    ["away", p.away],
  ];
  arr.sort((a, b) => b[1] - a[1]);
  return { key: arr[0]![0], margin: arr[0]![1] - arr[1]![1] };
}

/**
 * Leitet den finalen Score ab:
 *  1) Nennen BEIDE Modelle denselben Score (Konsens) und passt der zum
 *     Top-Ausgang ODER ist das Rennen knapp (margin < 0.10) → Konsens nehmen.
 *     (Verhindert, dass ein hauchdünner Wahrscheinlichkeits-Vorsprung den
 *      einhelligen Modell-Tipp kippt — der frühere 2:1-Bug.)
 *  2) Sonst: Score des stärksten Modells (Konfidenz × Accuracy-Gewicht),
 *     konsistent zum Top-Ausgang gemacht (Magnitude aus der xG-Baseline).
 */
function deriveScore(
  results: ModelResult[],
  p: Outcome1x2,
  baseline: Baseline,
  accWeights: EnsembleWeights | null,
): ScoreLine {
  const { key: topKey, margin } = topOutcome(p);

  const consensus =
    results.length === 2 &&
    results[0]!.prediction.predictedScore.home ===
      results[1]!.prediction.predictedScore.home &&
    results[0]!.prediction.predictedScore.away ===
      results[1]!.prediction.predictedScore.away
      ? results[0]!.prediction.predictedScore
      : null;

  if (consensus && (outcomeOf(consensus) === topKey || margin < 0.1)) {
    return consensus;
  }

  const strength = (r: ModelResult): number =>
    r.prediction.confidence * (accWeights?.weights[r.id] ?? 1);
  const top = results.slice().sort((a, b) => strength(b) - strength(a))[0]!;
  return makeConsistent(top.prediction.predictedScore, p, baseline);
}

/** Macht einen Score konsistent zum wahrscheinlichsten 1X2-Ausgang. */
function makeConsistent(
  score: ScoreLine,
  p: Outcome1x2,
  baseline?: Baseline,
): ScoreLine {
  const top = Math.max(p.home, p.draw, p.away);
  const sH = score.home;
  const sA = score.away;
  if (top === p.home && sH > sA) return score;
  if (top === p.away && sA > sH) return score;
  if (top === p.draw && sH === sA) return score;
  // sonst aus der Verteilung ableiten
  return scoreFromProbs(p, baseline);
}

/** Plausibler Score passend zum Top-Ausgang; Magnitude aus xG, wenn vorhanden. */
function scoreFromProbs(p: Outcome1x2, baseline?: Baseline): ScoreLine {
  const top = Math.max(p.home, p.draw, p.away);
  if (baseline) {
    const eg = baseline.expectedGoals;
    const h = Math.max(0, Math.round(eg.home));
    const a = Math.max(0, Math.round(eg.away));
    if (top === p.draw) {
      const d = Math.max(h, a);
      return { home: d, away: d };
    }
    if (top === p.home) {
      // Heimsieg: knappster plausibler Sieg, Magnitude aus xG.
      return h > a ? { home: h, away: a } : { home: a + 1, away: a };
    }
    // Auswärtssieg
    return a > h ? { home: h, away: a } : { home: h, away: h + 1 };
  }
  if (top === p.home) return { home: 2, away: 1 };
  if (top === p.away) return { home: 1, away: 2 };
  return { home: 1, away: 1 };
}

/** Regelbasierte Prosa-Synthese aus den keyFactors beider Modelle. */
function buildRationale(
  results: ModelResult[],
  agreement: number,
  accWeights: EnsembleWeights | null,
): string {
  const factors = new Set<string>();
  for (const r of results)
    for (const f of r.prediction.keyFactors) factors.add(f);
  const topFactors = [...factors].slice(0, 3);
  const accord =
    results.length === 2
      ? agreement >= 0.8
        ? "Beide Modelle sind sich weitgehend einig."
        : "Die Modelle sind uneinig — Konfidenz entsprechend gedämpft."
      : "Einschätzung auf Basis eines Modells.";
  // Nur erwähnen, wenn die Gewichtung spürbar von 50/50 abweicht.
  const w = accWeights?.weights;
  const weighting =
    w && Math.abs(w.claude - w.chatgpt) >= 0.1
      ? ` Gewichtung nach bisheriger Treffsicherheit: Claude ${Math.round(w.claude * 100)} %, ChatGPT ${Math.round(w.chatgpt * 100)} %.`
      : "";
  const why = topFactors.length
    ? ` Ausschlaggebend: ${topFactors.join("; ")}.`
    : "";
  return `${accord}${weighting}${why}`;
}

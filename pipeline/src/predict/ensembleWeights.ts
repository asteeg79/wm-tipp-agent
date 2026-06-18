/**
 * Accuracy-gewichtetes Ensemble (Verbesserung 6): bestimmt aus den bereits
 * BEENDETEN Partien, wie treffsicher Claude bzw. ChatGPT bisher getippt hat
 * (mittlerer Ranked Probability Score), und leitet daraus Gewichte für die
 * Zusammenführung künftiger Tipps ab. Das System lernt so während des
 * Turniers dazu: das nachweislich bessere Modell bekommt mehr Stimme.
 *
 * Schutzmechanismen gegen Überanpassung bei kleiner Stichprobe:
 *  - Mindestanzahl bewerteter Partien PRO Modell (sonst neutral 50/50).
 *  - Glättung (EPS) dämpft extreme Verhältnisse bei sehr kleinem RPS.
 *  - Clamp auf [0.25, 0.75]: kein Modell wird je ganz stummgeschaltet.
 */
import type { ModelComparison, Models, ScoreLine } from "@wm/shared";
import { aggregateAccuracy, scoreMatch } from "../features/accuracy.js";
import { round } from "../util/math.js";
import { config } from "../../config.js";

export interface EnsembleWeights {
  /** Normierte Gewichte (Summe 1). */
  weights: { claude: number; chatgpt: number };
  /** Mittlerer RPS je Modell (kleiner = besser). */
  rpsMean: { claude: number; chatgpt: number };
  /** Anzahl bewerteter Partien je Modell. */
  samples: { claude: number; chatgpt: number };
}

/** Beendete Partie mit den damals gespeicherten Einzelmodell-Tipps. */
export interface FinishedWithModels {
  actualResult: ScoreLine;
  models: Models;
}

/** Glättung: verhindert Gewichts-Explosion, wenn ein RPS nahe 0 liegt. */
const EPS = 0.05;
/** Glättung der Trefferquoten-Mischung (verhindert 0/0 bei lauter Fehltipps). */
const HIT_EPS = 0.05;
/** Unter-/Obergrenze je Gewicht — kein Modell fällt komplett raus. */
const W_MIN = 0.25;
const W_MAX = 0.75;

type ModelKey = "claude" | "chatgpt";

/**
 * Berechnet die Ensemble-Gewichte aus beendeten Partien — als BLEND aus zwei
 * Maßen, damit beide Sichtweisen einfließen:
 *  - RPS (Güte der gesamten Wahrscheinlichkeitsverteilung, kleiner = besser),
 *  - Tendenz-Trefferquote des Tipps (was Nutzer auf der Bilanz sehen).
 * Anteil über config.ensemble.rpsWeight (Default 0.6 RPS / 0.4 Treffer).
 * Liefert `null`, wenn die Datenlage (noch) keine belastbare Gewichtung
 * hergibt — der Aufrufer bleibt dann bei der neutralen Mittelung.
 */
export function computeModelWeights(
  finished: FinishedWithModels[],
  minSample: number,
): EnsembleWeights | null {
  const sums: Record<ModelKey, { rps: number; hits: number; n: number }> = {
    claude: { rps: 0, hits: 0, n: 0 },
    chatgpt: { rps: 0, hits: 0, n: 0 },
  };

  for (const f of finished) {
    for (const key of ["claude", "chatgpt"] as const) {
      const mp = f.models[key];
      if (!mp) continue;
      // predictedScore mitgeben → outcomeHit (Tendenz des sichtbaren Tipps).
      const acc = scoreMatch(
        mp.predictedScore,
        mp.probabilities,
        f.actualResult,
      );
      if (acc.rps === null) continue;
      sums[key].rps += acc.rps;
      sums[key].hits += acc.outcomeHit ? 1 : 0;
      sums[key].n++;
    }
  }

  // Beide Modelle brauchen genug bewertete Partien, sonst neutral bleiben.
  if (sums.claude.n < minSample || sums.chatgpt.n < minSample) return null;

  const rpsMean = {
    claude: sums.claude.rps / sums.claude.n,
    chatgpt: sums.chatgpt.rps / sums.chatgpt.n,
  };
  const hitRate = {
    claude: sums.claude.hits / sums.claude.n,
    chatgpt: sums.chatgpt.hits / sums.chatgpt.n,
  };

  // Claudes Anteil je Maß (jeweils 0..1, Summe mit ChatGPT = 1).
  // RPS: invers (kleiner = besser), mit Glättung. Treffer: direkt, mit Glättung.
  const invC = 1 / (rpsMean.claude + EPS);
  const invG = 1 / (rpsMean.chatgpt + EPS);
  const rpsShareClaude = invC / (invC + invG);
  const hitShareClaude =
    (hitRate.claude + HIT_EPS) /
    (hitRate.claude + hitRate.chatgpt + 2 * HIT_EPS);

  const rpsW = config.ensemble.rpsWeight;
  let wClaude = rpsW * rpsShareClaude + (1 - rpsW) * hitShareClaude;
  wClaude = Math.min(W_MAX, Math.max(W_MIN, wClaude));

  return {
    weights: { claude: round(wClaude, 4), chatgpt: round(1 - wClaude, 4) },
    rpsMean: {
      claude: round(rpsMean.claude, 4),
      chatgpt: round(rpsMean.chatgpt, 4),
    },
    samples: { claude: sums.claude.n, chatgpt: sums.chatgpt.n },
  };
}

/**
 * Vollständiger Modell-Vergleich für die App (Accuracy-Seite): je Modell die
 * Accuracy-Aggregate über die eigenen Tipps (Score + Wahrscheinlichkeiten)
 * plus — sofern belastbar — die aktuellen Ensemble-Gewichte.
 * `null`, solange keine Partie beendet ist.
 */
export function computeModelComparison(
  finished: FinishedWithModels[],
  minSample: number,
): ModelComparison | null {
  if (finished.length === 0) return null;

  const aggFor = (key: ModelKey) =>
    aggregateAccuracy(
      finished
        .filter((f) => f.models[key])
        .map((f) => ({
          actualResult: f.actualResult,
          accuracy: scoreMatch(
            f.models[key]!.predictedScore,
            f.models[key]!.probabilities,
            f.actualResult,
          ),
        })),
    );

  const weights = computeModelWeights(finished, minSample)?.weights;
  return {
    claude: aggFor("claude"),
    chatgpt: aggFor("chatgpt"),
    ...(weights ? { weights } : {}),
  };
}

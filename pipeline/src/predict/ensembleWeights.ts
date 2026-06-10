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
import type { Models, Outcome1x2, ScoreLine } from "@wm/shared";
import { scoreMatch } from "../features/accuracy.js";

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
/** Unter-/Obergrenze je Gewicht — kein Modell fällt komplett raus. */
const W_MIN = 0.25;
const W_MAX = 0.75;

type ModelKey = "claude" | "chatgpt";

/**
 * Berechnet die Ensemble-Gewichte aus beendeten Partien.
 * Liefert `null`, wenn die Datenlage (noch) keine belastbare Gewichtung
 * hergibt — der Aufrufer bleibt dann bei der neutralen Mittelung.
 */
export function computeModelWeights(
  finished: FinishedWithModels[],
  minSample: number,
): EnsembleWeights | null {
  const sums: Record<ModelKey, { rps: number; n: number }> = {
    claude: { rps: 0, n: 0 },
    chatgpt: { rps: 0, n: 0 },
  };

  for (const f of finished) {
    for (const key of ["claude", "chatgpt"] as const) {
      const probs: Outcome1x2 | undefined = f.models[key]?.probabilities;
      if (!probs) continue;
      const { rps } = scoreMatch(undefined, probs, f.actualResult);
      if (rps === null) continue;
      sums[key].rps += rps;
      sums[key].n++;
    }
  }

  // Beide Modelle brauchen genug bewertete Partien, sonst neutral bleiben.
  if (sums.claude.n < minSample || sums.chatgpt.n < minSample) return null;

  const rpsMean = {
    claude: sums.claude.rps / sums.claude.n,
    chatgpt: sums.chatgpt.rps / sums.chatgpt.n,
  };

  // Inverse-RPS-Gewichtung mit Glättung, dann normieren und clampen.
  const rawClaude = 1 / (rpsMean.claude + EPS);
  const rawChatgpt = 1 / (rpsMean.chatgpt + EPS);
  let wClaude = rawClaude / (rawClaude + rawChatgpt);
  wClaude = Math.min(W_MAX, Math.max(W_MIN, wClaude));

  return {
    weights: { claude: round4(wClaude), chatgpt: round4(1 - wClaude) },
    rpsMean: { claude: round4(rpsMean.claude), chatgpt: round4(rpsMean.chatgpt) },
    samples: { claude: sums.claude.n, chatgpt: sums.chatgpt.n },
  };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/**
 * Genauigkeits-Metriken nach Spielende (Abschnitt 9.5 / 17).
 * Berechnet pro abgeschlossener Partie:
 *  - exactScoreHit: exaktes Ergebnis getroffen
 *  - outcomeHit:    1X2-Ausgang korrekt
 *  - brier:         Multi-Class-Brier-Score über {home,draw,away}
 *  - rps:           Ranked Probability Score (ordinaler Ausgang)
 * sowie die Aggregate über alle bewerteten Partien.
 */
import type {
  AccuracyAggregate,
  AccuracyEntry,
  Outcome1x2,
  ScoreLine,
} from "@wm/shared";

type OutcomeKey = "home" | "draw" | "away";

function outcomeOf(score: ScoreLine): OutcomeKey {
  if (score.home > score.away) return "home";
  if (score.home < score.away) return "away";
  return "draw";
}

/**
 * Multi-Class-Brier-Score: Σ (p_i − o_i)^2 über die 3 Ausgänge.
 * Bereich 0 (perfekt) … 2 (maximal daneben).
 */
function brierScore(p: Outcome1x2, actual: OutcomeKey): number {
  const o = {
    home: actual === "home" ? 1 : 0,
    draw: actual === "draw" ? 1 : 0,
    away: actual === "away" ? 1 : 0,
  };
  return (
    (p.home - o.home) ** 2 + (p.draw - o.draw) ** 2 + (p.away - o.away) ** 2
  );
}

/**
 * Ranked Probability Score für den ordinalen Ausgang (home < draw < away).
 * RPS = 1/(K-1) · Σ_{i=1..K-1} ( Σ_{j<=i}(p_j − o_j) )^2, K=3.
 */
function rankedProbabilityScore(p: Outcome1x2, actual: OutcomeKey): number {
  const order: OutcomeKey[] = ["home", "draw", "away"];
  const o: Record<OutcomeKey, number> = {
    home: actual === "home" ? 1 : 0,
    draw: actual === "draw" ? 1 : 0,
    away: actual === "away" ? 1 : 0,
  };
  let cumP = 0;
  let cumO = 0;
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    cumP += p[order[i]!];
    cumO += o[order[i]!];
    sum += (cumP - cumO) ** 2;
  }
  return sum / (order.length - 1);
}

/** Berechnet die Accuracy einer einzelnen abgeschlossenen Partie. */
export function scoreMatch(
  predictedScore: ScoreLine | undefined,
  probabilities: Outcome1x2 | undefined,
  actual: ScoreLine,
): AccuracyEntry {
  const actualOutcome = outcomeOf(actual);
  const exactScoreHit =
    predictedScore != null &&
    predictedScore.home === actual.home &&
    predictedScore.away === actual.away;
  const outcomeHit =
    predictedScore != null && outcomeOf(predictedScore) === actualOutcome;

  return {
    exactScoreHit,
    outcomeHit,
    brier: probabilities ? round4(brierScore(probabilities, actualOutcome)) : null,
    rps: probabilities
      ? round4(rankedProbabilityScore(probabilities, actualOutcome))
      : null,
  };
}

/** Aggregiert die Einzel-Accuracies (ignoriert noch offene Partien). */
export function aggregateAccuracy(
  entries: { accuracy?: AccuracyEntry; actualResult: ScoreLine | null }[],
): AccuracyAggregate {
  const finished = entries.filter(
    (e) => e.actualResult !== null && e.accuracy,
  );
  const n = finished.length;
  if (n === 0) {
    return {
      finishedCount: 0,
      exactScoreRate: null,
      outcomeRate: null,
      brierMean: null,
      rpsMean: null,
    };
  }

  let exact = 0;
  let outcome = 0;
  let brierSum = 0;
  let brierN = 0;
  let rpsSum = 0;
  let rpsN = 0;
  for (const e of finished) {
    const a = e.accuracy!;
    if (a.exactScoreHit) exact++;
    if (a.outcomeHit) outcome++;
    if (a.brier !== null) {
      brierSum += a.brier;
      brierN++;
    }
    if (a.rps !== null) {
      rpsSum += a.rps;
      rpsN++;
    }
  }

  return {
    finishedCount: n,
    exactScoreRate: round4(exact / n),
    outcomeRate: round4(outcome / n),
    brierMean: brierN > 0 ? round4(brierSum / brierN) : null,
    rpsMean: rpsN > 0 ? round4(rpsSum / rpsN) : null,
  };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

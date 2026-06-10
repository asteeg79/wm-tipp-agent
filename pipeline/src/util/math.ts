/**
 * Zentrale Mathe-Helfer der Pipeline — ersetzt die zuvor 7× duplizierten
 * round2/round3/round4-Definitionen und die doppelt implementierte
 * Konfidenz-Formel (reconcile/buildData).
 */

/** Rundet auf `digits` Nachkommastellen. */
export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/**
 * Grobes Konfidenzmaß aus einer 1X2-Verteilung: max-Wahrscheinlichkeit
 * linear skaliert — 1/3 (maximale Unsicherheit) → 0, 1.0 → 1, gekappt.
 * Einzige Quelle für Baseline-Tipp UND KI-Fallback (müssen identisch bleiben).
 */
export function confidenceFromProbs(p: {
  home: number;
  draw: number;
  away: number;
}): number {
  const max = Math.max(p.home, p.draw, p.away);
  return round(Math.max(0, Math.min(1, (max - 1 / 3) / (1 - 1 / 3))), 4);
}

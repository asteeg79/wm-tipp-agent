/**
 * Zeit-Decay & Form (Abschnitt 11.3), deterministisch und exakt definiert.
 *   w_i = 0.5 ^ (Δt_i / H)        H = decayHalfLifeDays
 *   Δt_i = (heute − Spieldatum) in Tagen
 * Spiele gegen mögliche WM-Gegner zusätzlich mit Faktor α gewichtet.
 */
import type { TeamResult } from "@wm/shared";
import { config } from "../../config.js";

const MS_PER_DAY = 86_400_000;

/** Punkte aus einem Ergebnis (3/1/0). */
function points(gf: number, ga: number): number {
  if (gf > ga) return 3;
  if (gf === ga) return 1;
  return 0;
}

/** Zeit-Decay-Gewicht eines Spiels relativ zu `now`. */
export function recencyWeight(matchDate: string, now: Date): number {
  const dt = (now.getTime() - new Date(matchDate).getTime()) / MS_PER_DAY;
  if (dt < 0) return 1; // künftige/heutige Daten → volles Gewicht
  return 0.5 ** (dt / config.decayHalfLifeDays);
}

export interface FormMetrics {
  /** Zeit-decay-gewichtete Form (Punkte/Spiel, 0..3). */
  weightedForm: number;
  /** Form der letzten N Spiele (Punkte/Spiel, 0..3). */
  recentForm: number;
  goalsForAvg: number;
  goalsAgainstAvg: number;
  cleanSheetRate: number;
  matchesCount: number;
  /** Tage seit letztem Spiel. */
  daysSinceLastMatch: number | null;
}

/**
 * Berechnet Form-Kennzahlen aus den Ergebnissen eines Teams.
 * α-Gewichtung für Spiele gegen mögliche WM-Gegner (config.opponentHighlightWeight).
 */
export function computeForm(results: TeamResult[], now: Date): FormMetrics {
  if (results.length === 0) {
    return {
      weightedForm: 0,
      recentForm: 0,
      goalsForAvg: 0,
      goalsAgainstAvg: 0,
      cleanSheetRate: 0,
      matchesCount: 0,
      daysSinceLastMatch: null,
    };
  }

  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const alpha = config.opponentHighlightWeight;

  let wSum = 0;
  let wPts = 0;
  let wGf = 0;
  let wGa = 0;
  let cleanSheets = 0;

  for (const r of sorted) {
    let w = recencyWeight(r.date, now);
    if (r.isVsPotentialWcOpponent) w *= alpha;
    wSum += w;
    wPts += w * points(r.goalsFor, r.goalsAgainst);
    wGf += w * r.goalsFor;
    wGa += w * r.goalsAgainst;
    if (r.goalsAgainst === 0) cleanSheets++;
  }

  // Aktuelle Form: ungewichteter Schnitt der letzten N Pflichtspiele.
  const recent = sorted.slice(-config.formWindow);
  const recentPts =
    recent.reduce((s, r) => s + points(r.goalsFor, r.goalsAgainst), 0) /
    recent.length;

  const lastDate = new Date(sorted[sorted.length - 1]!.date);
  const days = Math.floor((now.getTime() - lastDate.getTime()) / MS_PER_DAY);

  return {
    weightedForm: wSum > 0 ? wPts / wSum : 0,
    recentForm: recentPts,
    goalsForAvg: wSum > 0 ? wGf / wSum : 0,
    goalsAgainstAvg: wSum > 0 ? wGa / wSum : 0,
    cleanSheetRate: cleanSheets / sorted.length,
    matchesCount: sorted.length,
    daysSinceLastMatch: Number.isFinite(days) ? days : null,
  };
}

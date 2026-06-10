import { z } from "zod";

/** ISO-8601-Datum/Zeit-String. */
export const IsoDateTime = z.string().datetime({ offset: true });
/** Reines Kalenderdatum YYYY-MM-DD. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD erwartet");

/** Wahrscheinlichkeit im Bereich 0..1. */
export const Probability = z.number().min(0).max(1);

/** 1X2-Wahrscheinlichkeiten (Heimsieg / Unentschieden / Auswärtssieg). */
export const Outcome1x2 = z.object({
  home: Probability,
  draw: Probability,
  away: Probability,
});
export type Outcome1x2 = z.infer<typeof Outcome1x2>;

/** Ergebnis (Tore). */
export const ScoreLine = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});
export type ScoreLine = z.infer<typeof ScoreLine>;

/** 1X2-Tendenz (Schlüssel in Outcome1x2). */
export type OutcomeKey = "home" | "draw" | "away";

/** Tendenz eines konkreten Ergebnisses (Heimsieg/Remis/Auswärtssieg). */
export function outcomeOf(score: { home: number; away: number }): OutcomeKey {
  if (score.home > score.away) return "home";
  if (score.home < score.away) return "away";
  return "draw";
}

/** Turnierphase einer Partie. */
export const Stage = z.enum([
  "group",
  "round32",
  "round16",
  "quarter",
  "semi",
  "third-place",
  "final",
]);
export type Stage = z.infer<typeof Stage>;

/** Status einer Partie. */
export const MatchStatus = z.enum(["scheduled", "live", "finished"]);
export type MatchStatus = z.infer<typeof MatchStatus>;

/** Klassifizierung der News-Materialität (von Heuristik + KI gesetzt). */
export const ImpactTag = z.enum([
  "injury",
  "suspension",
  "coach",
  "morale",
  "none",
]);
export type ImpactTag = z.infer<typeof ImpactTag>;

/** Stufe eines möglichen WM-Gegners. */
export const OpponentStage = z.enum(["group", "ko-likely"]);
export type OpponentStage = z.infer<typeof OpponentStage>;

/**
 * zod-Schema für die strukturierte LLM-Antwort (Abschnitt 11.4).
 * Beide Modelle MÜSSEN exakt dieses JSON liefern; alles wird validiert.
 *
 * zod/v4: erforderlich für `zodOutputFormat` des Anthropic-SDK (Structured
 * Outputs — die API garantiert dann schema-konformes JSON). Die API-Syntax
 * der hier genutzten Konstrukte ist mit v3 identisch.
 */
import { z } from "zod/v4";

/**
 * Rohschema OHNE Transform — geht als Structured-Output-Format an die
 * Claude-API (Transforms sind in JSON-Schema nicht darstellbar).
 */
export const LlmPredictionRaw = z.object({
  predictedScore: z.object({
    home: z.number().int().min(0).max(15),
    away: z.number().int().min(0).max(15),
  }),
  probabilities: z.object({
    home: z.number().min(0).max(1),
    draw: z.number().min(0).max(1),
    away: z.number().min(0).max(1),
  }),
  confidence: z.number().min(0).max(1),
  // Obergrenzen tolerant: LLMs überschreiten sie gern leicht → später kürzen.
  keyFactors: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
});

export const LlmPrediction = LlmPredictionRaw.transform((p) => ({
  ...p,
  keyFactors: p.keyFactors.slice(0, 6),
  risks: p.risks.slice(0, 4),
}));
export type LlmPrediction = z.infer<typeof LlmPrediction>;

/** Renormiert die Wahrscheinlichkeiten robust auf Summe 1. */
export function normalizeProbs(p: {
  home: number;
  draw: number;
  away: number;
}): { home: number; draw: number; away: number } {
  const sum = p.home + p.draw + p.away;
  if (sum <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: p.home / sum, draw: p.draw / sum, away: p.away / sum };
}

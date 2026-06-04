import { z } from "zod";
import { IsoDateTime, Outcome1x2, ScoreLine, Stage } from "./common.js";

/** Genauigkeits-Metriken pro abgeschlossener Partie. */
export const AccuracyEntry = z.object({
  /** Exakter Score getroffen. */
  exactScoreHit: z.boolean().nullable().default(null),
  /** 1X2-Ausgang korrekt. */
  outcomeHit: z.boolean().nullable().default(null),
  /** Brier-Score-Beitrag dieser Partie (niedriger = besser). */
  brier: z.number().nullable().default(null),
  /** Ranked Probability Score dieser Partie. */
  rps: z.number().nullable().default(null),
});
export type AccuracyEntry = z.infer<typeof AccuracyEntry>;

/** Ein Eintrag im Prognose-Index. */
export const PredictionIndexEntry = z.object({
  matchId: z.string(),
  date: IsoDateTime,
  stage: Stage,
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  predictedScore: ScoreLine.optional(),
  probabilities: Outcome1x2.optional(),
  confidence: z.number().min(0).max(1).optional(),
  actualResult: ScoreLine.nullable().default(null),
  accuracy: AccuracyEntry.optional(),
});
export type PredictionIndexEntry = z.infer<typeof PredictionIndexEntry>;

/** Aggregierte Trust-Metriken über alle abgeschlossenen Partien. */
export const AccuracyAggregate = z.object({
  finishedCount: z.number().int().min(0),
  exactScoreRate: z.number().min(0).max(1).nullable().default(null),
  outcomeRate: z.number().min(0).max(1).nullable().default(null),
  brierMean: z.number().nullable().default(null),
  rpsMean: z.number().nullable().default(null),
});
export type AccuracyAggregate = z.infer<typeof AccuracyAggregate>;

/** data/predictions-index.json */
export const PredictionsIndex = z.object({
  lastUpdated: IsoDateTime,
  aggregate: AccuracyAggregate,
  entries: z.array(PredictionIndexEntry),
});
export type PredictionsIndex = z.infer<typeof PredictionsIndex>;

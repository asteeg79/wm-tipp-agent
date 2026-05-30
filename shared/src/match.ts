import { z } from "zod";
import {
  IsoDateTime,
  Outcome1x2,
  ScoreLine,
  Stage,
  MatchStatus,
  Probability,
} from "./common.js";

/** Spielort inkl. Kontextfaktoren (Höhe, neutral). */
export const Venue = z.object({
  city: z.string(),
  altitude: z.number().optional(),
  neutral: z.boolean(),
});
export type Venue = z.infer<typeof Venue>;

/** Erwartete Tore aus der Poisson-Baseline. */
export const ExpectedGoals = z.object({
  home: z.number().min(0),
  away: z.number().min(0),
});
export type ExpectedGoals = z.infer<typeof ExpectedGoals>;

/** Deterministische Baseline (Elo + Poisson), keine KI. */
export const Baseline = z.object({
  source: z.string(),
  probabilities: Outcome1x2,
  expectedGoals: ExpectedGoals,
});
export type Baseline = z.infer<typeof Baseline>;

/** Antwort eines einzelnen LLM (Claude oder ChatGPT). */
export const ModelPrediction = z.object({
  predictedScore: ScoreLine,
  probabilities: Outcome1x2,
  confidence: Probability,
  keyFactors: z.array(z.string()),
  risks: z.array(z.string()),
});
export type ModelPrediction = z.infer<typeof ModelPrediction>;

/** Sammlung der Einzelmodell-Antworten. */
export const Models = z.object({
  claude: ModelPrediction.optional(),
  chatgpt: ModelPrediction.optional(),
});
export type Models = z.infer<typeof Models>;

/** Ein einzelner Tipp-Snapshot (aktuell oder historisch). */
export const Prediction = z.object({
  generatedAt: IsoDateTime,
  predictedScore: ScoreLine,
  probabilities: Outcome1x2,
  confidence: Probability,
  baseline: Baseline.optional(),
  models: Models.optional(),
  /** Übereinstimmung der Modelle 0..1. */
  agreement: Probability.optional(),
  rationale: z.string().optional(),
  /** Hash des Feature-Bundles für Re-Trigger-Logik. */
  inputHash: z.string().optional(),
});
export type Prediction = z.infer<typeof Prediction>;

/** Verkürzter historischer Tipp-Eintrag (Timeline). */
export const PredictionHistoryEntry = z.object({
  generatedAt: IsoDateTime,
  predictedScore: ScoreLine,
  probabilities: Outcome1x2,
  confidence: Probability,
});
export type PredictionHistoryEntry = z.infer<typeof PredictionHistoryEntry>;

/** Feature-Bundle: deterministischer Input für die KI (Phase 4 füllt dies). */
export const FeatureBundle = z.object({
  /** Frei strukturierte, deterministisch erzeugte Features beider Teams. */
  generatedAt: IsoDateTime,
  data: z.record(z.unknown()),
});
export type FeatureBundle = z.infer<typeof FeatureBundle>;

/** Vollständiges Match-Dokument: data/matches/<matchId>.json */
export const Match = z.object({
  id: z.string(),
  date: IsoDateTime,
  stage: Stage,
  groupId: z.string().optional(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  venue: Venue,
  status: MatchStatus,
  /** Nach Spielende gesetzt. */
  actualResult: ScoreLine.nullable().default(null),
  featureBundle: FeatureBundle.optional(),
  prediction: Prediction.optional(),
  predictionHistory: z.array(PredictionHistoryEntry).default([]),
});
export type Match = z.infer<typeof Match>;

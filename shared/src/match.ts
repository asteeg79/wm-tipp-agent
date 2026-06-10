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
  /**
   * Ensemble-Gewichte nach gemessener Treffsicherheit (mittlerer RPS über
   * beendete Partien; Summe 1). Nur gesetzt, wenn die Gewichtung aktiv war.
   */
  ensembleWeights: z
    .object({ claude: Probability, chatgpt: Probability })
    .optional(),
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

/**
 * Buchmacher-Markt: aus den h2h-Quoten mehrerer Buchmacher abgeleitete
 * 1X2-Wahrscheinlichkeiten (de-vig-bereinigt) + repräsentative Dezimalquoten.
 */
export const MarketOdds = z.object({
  source: z.string(),
  updatedAt: IsoDateTime,
  /** Anzahl der Buchmacher, über die gemittelt wurde. */
  bookmakerCount: z.number().int().min(0),
  /** Normierte 1X2-Wahrscheinlichkeiten (Σ = 1, Buchmacher-Marge entfernt). */
  probabilities: Outcome1x2,
  /** Repräsentative Dezimalquote (Median über die Buchmacher). */
  decimal: z.object({
    home: z.number(),
    draw: z.number(),
    away: z.number(),
  }),
});
export type MarketOdds = z.infer<typeof MarketOdds>;

/** Deterministische Form-/Stärke-Features eines Teams für eine Partie. */
export const TeamFeatures = z.object({
  teamId: z.string(),
  elo: z.number(),
  /** Zeit-decay-gewichtete Form (Punkte/Spiel, 0..3). */
  weightedForm: z.number(),
  /** Form der letzten N Spiele (Punkte/Spiel, 0..3). */
  recentForm: z.number(),
  /** Gewichteter Schnitt erzielter/kassierter Tore. */
  goalsForAvg: z.number(),
  goalsAgainstAvg: z.number(),
  cleanSheetRate: z.number().min(0).max(1),
  /** Anzahl Spiele in der Historie (Datengrundlage). */
  matchesCount: z.number().int().min(0),
  /** Tage seit dem letzten Spiel (Erholung), falls bekannt. */
  daysSinceLastMatch: z.number().int().nullable().default(null),
});
export type TeamFeatures = z.infer<typeof TeamFeatures>;

/** Kontextfaktoren der Partie (deterministisch ableitbar). */
export const MatchContext = z.object({
  neutralVenue: z.boolean(),
  altitude: z.number().nullable().default(null),
  /** "home" wenn ein Team Gastgeber ist (USA/CAN/MEX), sonst null. */
  hostAdvantageTeamId: z.string().nullable().default(null),
});
export type MatchContext = z.infer<typeof MatchContext>;

/**
 * Feature-Bundle: deterministischer Input für die KI (Abschnitt 9.4 / 11).
 * Strukturiert, damit App und LLMs typsicher darauf zugreifen.
 */
export const FeatureBundle = z.object({
  generatedAt: IsoDateTime,
  home: TeamFeatures,
  away: TeamFeatures,
  /** H2H aus Sicht des Heimteams. */
  h2h: z.object({
    played: z.number().int().min(0),
    homeWins: z.number().int().min(0),
    draws: z.number().int().min(0),
    awayWins: z.number().int().min(0),
    homeGoals: z.number().int().min(0),
    awayGoals: z.number().int().min(0),
  }),
  context: MatchContext,
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
  /** Buchmacher-Markt (optional, nur wenn Odds-Quelle aktiv). */
  market: MarketOdds.optional(),
});
export type Match = z.infer<typeof Match>;

import { z } from "zod";
import {
  IsoDate,
  IsoDateTime,
  ImpactTag,
  OpponentStage,
} from "./common.js";

/** Ein einzelnes vergangenes Ergebnis eines Teams (letzte 2 Jahre). */
export const TeamResult = z.object({
  matchId: z.string(),
  date: IsoDate,
  competition: z.string(),
  home: z.boolean(),
  opponentId: z.string(),
  opponentName: z.string(),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  venue: z.enum(["home", "away", "neutral"]),
  /** Markiert Spiele gegen mögliche WM-Gegner → UI-Hervorhebung. */
  isVsPotentialWcOpponent: z.boolean(),
  /** Zeit-Decay-Gewicht (Abschnitt 11.3), wird in Phase 4 gefüllt. */
  recencyWeight: z.number().min(0).max(1).optional(),
});
export type TeamResult = z.infer<typeof TeamResult>;

/** Aggregierte Form-Kennzahlen eines Teams. */
export const TeamForm = z.object({
  last10Points: z.number(),
  weightedForm: z.number(),
  goalsForAvg: z.number(),
  goalsAgainstAvg: z.number(),
  cleanSheetRate: z.number().min(0).max(1),
});
export type TeamForm = z.infer<typeof TeamForm>;

/** Head-to-Head-Zusammenfassung gegen einen bestimmten Gegner. */
export const H2hSummary = z.object({
  played: z.number().int().min(0),
  w: z.number().int().min(0),
  d: z.number().int().min(0),
  l: z.number().int().min(0),
  gf: z.number().int().min(0),
  ga: z.number().int().min(0),
});
export type H2hSummary = z.infer<typeof H2hSummary>;

/** Ein möglicher WM-Gegner (Gruppe sicher / K.-o. wahrscheinlich). */
export const PotentialOpponent = z.object({
  teamId: z.string(),
  stage: OpponentStage,
  h2hSummary: H2hSummary,
});
export type PotentialOpponent = z.infer<typeof PotentialOpponent>;

/** Ein News-Item (nur Metadaten + Snippet, kein Volltext). */
export const NewsItem = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().url(),
  publishedAt: IsoDateTime,
  snippet: z.string(),
  impactTag: ImpactTag,
});
export type NewsItem = z.infer<typeof NewsItem>;

/** Vollständiges Team-Detail-Dokument: data/teams/<teamId>.json */
export const Team = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  logo: z.string().url().optional(),
  groupId: z.string(),
  fifaRanking: z.number().int().positive().optional(),
  elo: z.number().optional(),
  lastUpdated: IsoDateTime,
  results: z.array(TeamResult),
  form: TeamForm.optional(),
  potentialOpponents: z.array(PotentialOpponent),
  news: z.array(NewsItem),
});
export type Team = z.infer<typeof Team>;

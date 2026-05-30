import { z } from "zod";
import { IsoDateTime } from "./common.js";

/** Eine Zeile in einer Gruppentabelle. */
export const StandingRow = z.object({
  teamId: z.string(),
  rank: z.number().int().positive(),
  played: z.number().int().min(0),
  win: z.number().int().min(0),
  draw: z.number().int().min(0),
  loss: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  goalDiff: z.number().int(),
  points: z.number().int().min(0),
  /** Monte-Carlo: Wahrscheinlichkeit für Weiterkommen (Phase 7). */
  advanceProbability: z.number().min(0).max(1).optional(),
});
export type StandingRow = z.infer<typeof StandingRow>;

/** Eine vollständige Gruppentabelle. */
export const GroupStanding = z.object({
  groupId: z.string(),
  rows: z.array(StandingRow),
});
export type GroupStanding = z.infer<typeof GroupStanding>;

/** data/standings.json */
export const Standings = z.object({
  lastUpdated: IsoDateTime,
  groups: z.array(GroupStanding),
});
export type Standings = z.infer<typeof Standings>;

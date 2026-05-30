import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common.js";

/** Turnier-Metadaten. */
export const Tournament = z.object({
  name: z.string(),
  startDate: IsoDate,
  endDate: IsoDate,
});
export type Tournament = z.infer<typeof Tournament>;

/** Eine Gruppe mit ihren Team-IDs. */
export const Group = z.object({
  id: z.string(),
  teamIds: z.array(z.string()),
});
export type Group = z.infer<typeof Group>;

/** Kompakter Team-Eintrag im Index (Stammdaten). */
export const TeamSummary = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  logo: z.string().url().optional(),
  groupId: z.string(),
});
export type TeamSummary = z.infer<typeof TeamSummary>;

/** data/index.json — Turnier-Meta, Teams-Liste, Gruppen. */
export const IndexFile = z.object({
  tournament: Tournament,
  lastUpdated: IsoDateTime,
  groups: z.array(Group),
  teams: z.array(TeamSummary),
});
export type IndexFile = z.infer<typeof IndexFile>;

/**
 * openfootball-History-Provider (gemeinfrei, kein API-Key).
 * Quelle: openfootball/internationals (Football.TXT) — Freundschaftsspiele,
 * Nations League, Kontinental-Turniere + deren Qualifikationen, WM-Quali.
 *
 * Lädt einen festen Satz Wettbewerbsdateien für die Historie-Saisons (gecacht:
 * vergangene Jahre unveränderlich → für immer; laufendes Jahr kurze TTL),
 * parst sie und beantwortet getTeamHistory rein lokal (keine Pro-Team-Requests).
 */
import type { TeamSummary } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { canonicalId, teamSlug } from "./countries.js";
import { fetchText } from "./http.js";
import { parseFootballTxt, type ParsedMatch } from "./footballTxt.js";
import type { HistoryMatch, HistoryProvider } from "./types.js";

/** Wettbewerbe im internationals-Repo (Datei = `<dir>/<year>_<dir>.txt`). */
const COMPETITIONS: { dir: string; name: string }[] = [
  { dir: "friendly", name: "Friendly" },
  { dir: "uefa_nations_league", name: "UEFA Nations League" },
  { dir: "uefa_euro", name: "UEFA Euro" },
  { dir: "uefa_euro_qualification", name: "Euro Qualification" },
  { dir: "fifa_world_cup_qualification", name: "WC Qualification" },
  { dir: "copa_america", name: "Copa América" },
  { dir: "copa_america_qualification", name: "Copa Qualification" },
  { dir: "african_cup_of_nations", name: "Africa Cup of Nations" },
  {
    dir: "african_cup_of_nations_qualification",
    name: "AFCON Qualification",
  },
  { dir: "afc_asian_cup", name: "AFC Asian Cup" },
  { dir: "afc_asian_cup_qualification", name: "Asian Cup Qualification" },
  { dir: "concacaf_nations_league", name: "CONCACAF Nations League" },
  { dir: "gold_cup", name: "Gold Cup" },
  { dir: "gold_cup_qualification", name: "Gold Cup Qualification" },
  { dir: "oceania_nations_cup", name: "OFC Nations Cup" },
];

interface PoolMatch extends ParsedMatch {
  competition: string;
  idA: string;
  idB: string;
}

export class OpenFootballHistoryProvider implements HistoryProvider {
  readonly name = "openfootball-internationals";
  private pool: PoolMatch[] | null = null;
  private filesLoaded = 0;

  getFilesLoaded(): number {
    return this.filesLoaded;
  }

  /** Lädt + parst alle Wettbewerbsdateien der Historie-Saisons (memoisiert). */
  private async loadPool(seasons: number[]): Promise<PoolMatch[]> {
    if (this.pool) return this.pool;
    const base = config.openFootball.internationalsBaseUrl;
    const currentYear = new Date().getUTCFullYear();
    const pool: PoolMatch[] = [];

    for (const year of seasons) {
      for (const comp of COMPETITIONS) {
        const url = `${base}/${comp.dir}/${year}_${comp.dir}.txt`;
        const cacheKey = `of-hist:${url}`;
        const ttl = year < currentYear ? Infinity : 6 * 60 * 60 * 1000;

        let parsed = await cacheGet<ParsedMatch[]>(cacheKey, ttl);
        if (parsed === null) {
          const text = await fetchText(url, {
            maxRetries: 3,
            backoffBaseMs: 1000,
          });
          parsed = text ? parseFootballTxt(text, year) : [];
          await cacheSet(cacheKey, parsed);
          if (text) this.filesLoaded++;
        } else {
          this.filesLoaded++;
        }

        for (const m of parsed) {
          pool.push({
            ...m,
            competition: comp.name,
            idA: canonicalId(m.teamA),
            idB: canonicalId(m.teamB),
          });
        }
      }
    }

    this.pool = pool;
    return pool;
  }

  async getTeamHistory(
    team: TeamSummary,
    seasons: number[],
  ): Promise<HistoryMatch[]> {
    const pool = await this.loadPool(seasons);
    const seasonSet = new Set(seasons);
    const out: HistoryMatch[] = [];

    for (const m of pool) {
      const isA = m.idA === team.id;
      const isB = m.idB === team.id;
      if (!isA && !isB) continue;
      const year = Number(m.date.slice(0, 4));
      if (!seasonSet.has(year)) continue;

      const oppName = isA ? m.teamB : m.teamA;
      out.push({
        matchId: `of-${m.date}-${teamSlug(m.teamA)}-${teamSlug(m.teamB)}`,
        date: m.date,
        competition: m.competition,
        home: isA,
        neutral: false,
        opponentId: isA ? m.idB : m.idA,
        opponentName: oppName,
        goalsFor: isA ? m.scoreA : m.scoreB,
        goalsAgainst: isA ? m.scoreB : m.scoreA,
      });
    }

    const byId = new Map(out.map((x) => [x.matchId, x]));
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}

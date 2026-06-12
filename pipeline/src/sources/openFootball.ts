/**
 * openfootball-Provider (gemeinfrei, kein API-Key).
 * Quelle: worldcup.json (auto-generiert, täglich aktualisiert).
 *   https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
 *
 * Liefert WM-2026-Struktur (Teams, 12 Gruppen, Spielplan) + Ergebnisse.
 * Teams werden über Namen identifiziert → Mapping auf Code/Flagge via
 * countries.ts; Team-ID = Slug des Namens (stabil, quellenübergreifend).
 */
import type { Group, TeamSummary, Tournament } from "@wm/shared";
import type { Stage } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { canonicalId, flagUrl, lookupCountry, teamSlug } from "./countries.js";
import { fetchJson } from "./http.js";
import type {
  NormalizedFixture,
  TournamentData,
  TournamentProvider,
} from "./types.js";

// Kurze TTL: Während des Turniers trägt diese Datei die ERGEBNISSE — ein
// langer Cache (vorher 6 h, via Actions-Cache über Läufe hinweg konserviert)
// hielt beendete Spiele stundenlang zurück. Die Datei ist klein; einmal pro
// Lauf frisch zu holen kostet praktisch nichts.
const TTL_MS = 10 * 60 * 1000; // 10 min

interface OfMatch {
  round: string;
  date?: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: {
    ft?: [number, number];
    et?: [number, number];
    p?: [number, number];
  };
}
interface OfFile {
  name: string;
  matches: OfMatch[];
}

export class OpenFootballProvider implements TournamentProvider {
  readonly name = "openfootball";
  private readonly url: string;
  private cache: OfFile | null = null;

  constructor() {
    const { worldCupBaseUrl, season } = config.openFootball;
    this.url = `${worldCupBaseUrl}/${season}/worldcup.json`;
  }

  private async load(): Promise<OfFile> {
    if (this.cache) return this.cache;
    const cacheKey = `of:${this.url}`;
    const cached = await cacheGet<OfFile>(cacheKey, TTL_MS);
    if (cached) {
      this.cache = cached;
      return cached;
    }
    const data = await fetchJson<OfFile>(this.url, {
      maxRetries: 3,
      backoffBaseMs: 1000,
    });
    await cacheSet(cacheKey, data);
    this.cache = data;
    return data;
  }

  async getTournament(): Promise<TournamentData> {
    const file = await this.load();

    // Gruppen + Teams aus den Gruppenspielen ableiten.
    const groupsMap = new Map<string, Set<string>>(); // groupId → teamIds
    const teamMap = new Map<string, TeamSummary>();

    for (const m of file.matches) {
      if (!m.group) continue;
      const groupId = normalizeGroupId(m.group);
      for (const teamName of [m.team1, m.team2]) {
        if (isPlaceholder(teamName)) continue;
        const id = canonicalId(teamName);
        if (!teamMap.has(id)) {
          teamMap.set(id, buildTeamSummary(teamName, groupId));
        }
        if (!groupsMap.has(groupId)) groupsMap.set(groupId, new Set());
        groupsMap.get(groupId)!.add(id);
      }
    }

    const teams = [...teamMap.values()];
    const groups: Group[] = [...groupsMap.entries()]
      .map(([id, ids]) => ({ id, teamIds: [...ids].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const tournament: Tournament = {
      name: "FIFA World Cup",
      startDate: "2026-06-11",
      endDate: "2026-07-19",
    };

    // openfootball hat vor Turnierstart keine Tabellenränge → leer
    // (KO-Heuristik fällt dann auf "nur Gruppengegner" zurück; Phase 4: Elo).
    return { tournament, groups, teams, rankByTeamId: {} };
  }

  async getSchedule(): Promise<NormalizedFixture[]> {
    const file = await this.load();
    const out: NormalizedFixture[] = [];
    for (const m of file.matches) {
      if (isPlaceholder(m.team1) || isPlaceholder(m.team2)) continue;
      const ft = m.score?.ft ?? null;
      const fixture: NormalizedFixture = {
        matchId: `wc2026-${teamSlug(m.team1)}-${teamSlug(m.team2)}-${m.date ?? "tbd"}`,
        date: m.date ?? "",
        competition: file.name,
        homeTeamId: canonicalId(m.team1),
        homeTeamName: m.team1,
        awayTeamId: canonicalId(m.team2),
        awayTeamName: m.team2,
        goalsHome: ft ? ft[0] : null,
        goalsAway: ft ? ft[1] : null,
        neutral: true,
        finished: ft !== null,
      };
      const stage = roundToStage(m.round, !!m.group);
      if (stage) fixture.stage = stage;
      if (m.group) fixture.groupId = normalizeGroupId(m.group);
      if (m.ground) {
        fixture.ground = m.ground;
        const alt = cityAltitude(m.ground);
        if (alt !== null) fixture.altitude = alt;
      }
      const dt = toIsoDateTime(m.date, m.time);
      if (dt) fixture.dateTime = dt;
      out.push(fixture);
    }
    return out;
  }
}

function buildTeamSummary(name: string, groupId: string): TeamSummary {
  const info = lookupCountry(name);
  const base: TeamSummary = {
    id: canonicalId(name),
    name,
    code: info?.code ?? name.slice(0, 3).toUpperCase(),
    groupId,
  };
  if (info) base.logo = flagUrl(info.iso2);
  else
    console.warn(`[openfootball] unbekanntes Land (kein Flag/Code): ${name}`);
  return base;
}

/** Höhe (m) bekannter WM-2026-Spielorte; null wenn unbekannt/Meereshöhe. */
function cityAltitude(ground: string): number | null {
  const g = ground.toLowerCase();
  if (g.includes("mexico city")) return 2240;
  if (g.includes("guadalajara") || g.includes("zapopan")) return 1566;
  if (g.includes("denver")) return 1609;
  if (g.includes("monterrey")) return 540;
  return null;
}

/** KO-Platzhalter wie "W101", "1A", "2B", "3rd A/B/C/D" erkennen. */
function isPlaceholder(name: string): boolean {
  return /^(W|L|RU|\d|[123]rd|winner|loser)/i.test(name.trim());
}

/** "Group A" → "A". */
function normalizeGroupId(group: string): string {
  const m = /group\s+([A-Z0-9]+)/i.exec(group);
  return m ? m[1]!.toUpperCase() : group;
}

/** openfootball-Rundenname → Stage-Enum. */
function roundToStage(round: string, hasGroup: boolean): Stage | undefined {
  if (hasGroup) return "group";
  const r = round.toLowerCase();
  if (r.includes("round of 32") || r.includes("last 32")) return "round32";
  if (r.includes("round of 16") || r.includes("last 16")) return "round16";
  if (r.includes("quarter")) return "quarter";
  if (r.includes("semi")) return "semi";
  if (r.includes("third") || r.includes("3rd")) return "third-place";
  if (r.includes("final")) return "final";
  return undefined;
}

/** Kombiniert openfootball-Datum + "HH:MM UTC-6" zu ISO-8601 mit Offset. */
function toIsoDateTime(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  if (!time) return `${date}T00:00:00Z`;
  const m = /^(\d{1,2}):(\d{2})\s*(UTC([+-]\d{1,2}))?/.exec(time.trim());
  if (!m) return `${date}T00:00:00Z`;
  const hh = m[1]!.padStart(2, "0");
  const mm = m[2]!;
  const offHours = m[4] ? Number(m[4]) : 0;
  const sign = offHours >= 0 ? "+" : "-";
  const off = `${sign}${String(Math.abs(offHours)).padStart(2, "0")}:00`;
  return `${date}T${hh}:${mm}:00${m[3] ? off : "Z"}`;
}

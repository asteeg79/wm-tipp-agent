/**
 * API-Football-Adapter (api-sports.io) hinter dem DataProvider-Interface.
 *
 * Auth: Header `x-apisports-key`. Mappt alle Antworten ins normalisierte
 * Format. Inkrementell + gecacht: vergangene Saisons unveränderlich (Cache
 * für immer), aktuelle Saison mit kurzer TTL.
 */
import type { Group, TeamSummary, Tournament } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { fetchJson } from "./http.js";
import type {
  DataProvider,
  NormalizedFixture,
  TournamentData,
} from "./types.js";

/** Zähler verbrauchter API-Requests pro Lauf (Free-Tier-Budget-Schutz). */
let requestCount = 0;
export const getRequestCount = (): number => requestCount;

const CURRENT_SEASON_TTL_MS = 6 * 60 * 60 * 1000; // 6 h für laufende Saison

// --- Rohformat-Typen (nur die benötigten Felder) ---------------------------

interface ApiEnvelope<T> {
  response: T;
  results: number;
  errors: unknown;
}

interface ApiTeam {
  team: { id: number; name: string; code: string | null; logo: string | null };
}

interface ApiStandingRow {
  rank: number;
  group: string;
  team: { id: number; name: string };
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
    venue: { name: string | null; city: string | null };
  };
  league: { name: string; round: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

// --- Adapter ---------------------------------------------------------------

export class ApiFootballProvider implements DataProvider {
  readonly name = "api-football";
  private readonly apiKey: string;
  private readonly base = config.apiFootball.baseUrl;
  private readonly leagueId = config.worldCup.leagueId;
  private readonly season = config.worldCup.season;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("API_FOOTBALL_KEY fehlt");
    this.apiKey = apiKey;
  }

  /** Generischer GET mit Cache, Budget-Check und Fehlerprüfung. */
  private async get<T>(
    path: string,
    params: Record<string, string | number>,
    ttlMs: number,
  ): Promise<T> {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const url = `${this.base}/${path}?${qs}`;
    const cacheKey = `apf:${url}`;

    const cached = await cacheGet<T>(cacheKey, ttlMs);
    if (cached !== null) return cached;

    if (requestCount >= config.maxFootballRequestsPerRun) {
      throw new BudgetExhaustedError(
        `Request-Budget (${config.maxFootballRequestsPerRun}) erschöpft`,
      );
    }
    requestCount++;

    const env = await fetchJson<ApiEnvelope<T>>(url, {
      headers: { "x-apisports-key": this.apiKey },
      maxRetries: config.apiFootball.maxRetries,
      backoffBaseMs: config.apiFootball.backoffBaseMs,
    });

    if (env.errors && Object.keys(env.errors as object).length > 0) {
      throw new Error(`API-Football-Fehler (${url}): ${JSON.stringify(env.errors)}`);
    }
    await cacheSet(cacheKey, env.response);
    return env.response;
  }

  async getTournament(): Promise<TournamentData> {
    const [teamsResp, standingsResp] = await Promise.all([
      this.get<ApiTeam[]>(
        "teams",
        { league: this.leagueId, season: this.season },
        CURRENT_SEASON_TTL_MS,
      ),
      this.get<StandingsResponse>(
        "standings",
        { league: this.leagueId, season: this.season },
        CURRENT_SEASON_TTL_MS,
      ),
    ]);

    const teams: TeamSummary[] = teamsResp.map((t) => {
      const base: TeamSummary = {
        id: String(t.team.id),
        name: t.team.name,
        code: t.team.code ?? t.team.name.slice(0, 3).toUpperCase(),
        groupId: "",
      };
      return t.team.logo ? { ...base, logo: t.team.logo } : base;
    });

    // Gruppen + Ränge aus den Standings ableiten.
    const groupsMap = new Map<string, string[]>();
    const teamGroup = new Map<string, string>();
    const rankByTeamId: Record<string, number> = {};
    const standings = standingsResp[0]?.league.standings ?? [];
    for (const groupRows of standings) {
      for (const row of groupRows) {
        const groupId = normalizeGroupId(row.group);
        const teamId = String(row.team.id);
        if (!groupsMap.has(groupId)) groupsMap.set(groupId, []);
        groupsMap.get(groupId)!.push(teamId);
        teamGroup.set(teamId, groupId);
        rankByTeamId[teamId] = row.rank;
      }
    }

    // groupId in die Team-Summaries eintragen.
    for (const team of teams) {
      team.groupId = teamGroup.get(team.id) ?? "";
    }

    const groups: Group[] = [...groupsMap.entries()]
      .map(([id, teamIds]) => ({ id, teamIds }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const tournament: Tournament = {
      name: "FIFA World Cup",
      startDate: "2026-06-11",
      endDate: "2026-07-19",
    };

    return { tournament, groups, teams, rankByTeamId };
  }

  async getTeamFixtures(
    teamId: string,
    seasons: number[],
  ): Promise<NormalizedFixture[]> {
    const out: NormalizedFixture[] = [];
    const currentYear = new Date().getUTCFullYear();

    for (const season of seasons) {
      // Vergangene Saisons sind unveränderlich → für immer cachen.
      const ttl = season < currentYear ? Infinity : CURRENT_SEASON_TTL_MS;
      const resp = await this.get<ApiFixture[]>(
        "fixtures",
        { team: Number(teamId), season },
        ttl,
      );
      for (const fx of resp) {
        const finished = isFinished(fx.fixture.status.short);
        if (!finished) continue;
        if (fx.goals.home === null || fx.goals.away === null) continue;
        out.push({
          matchId: String(fx.fixture.id),
          date: fx.fixture.date.slice(0, 10),
          competition: fx.league.name,
          homeTeamId: String(fx.teams.home.id),
          homeTeamName: fx.teams.home.name,
          awayTeamId: String(fx.teams.away.id),
          awayTeamName: fx.teams.away.name,
          goalsHome: fx.goals.home,
          goalsAway: fx.goals.away,
          neutral: false,
          finished: true,
        });
      }
    }

    // Dedupe nach matchId (Saison-Überlappung möglich) + chronologisch.
    const byId = new Map(out.map((f) => [f.matchId, f]));
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}

type StandingsResponse = Array<{
  league: { standings: ApiStandingRow[][] };
}>;

/** Fehler, der signalisiert, dass das Request-Budget erschöpft ist. */
export class BudgetExhaustedError extends Error {}

/** API-Football-Status-Kürzel für beendete Spiele. */
function isFinished(short: string): boolean {
  return ["FT", "AET", "PEN"].includes(short);
}

/** "Group A" / "Group H" → "A".."H"; Fallback: Originalstring. */
function normalizeGroupId(group: string): string {
  const m = /group\s+([A-Z0-9]+)/i.exec(group);
  return m ? m[1]!.toUpperCase() : group;
}

/**
 * Buchmacher-Quoten von The Odds API (https://the-odds-api.com).
 * Holt die h2h-Quoten aller WM-2026-Partien, mittelt sie robust über die
 * Buchmacher (Median je Ausgang) und rechnet sie de-vig-bereinigt in
 * 1X2-Wahrscheinlichkeiten um.
 *
 * KOSTEN: Free-Tier = 500 Credits/Monat. Ein Abruf (1 Region × 1 Markt) kostet
 * 1 Credit und liefert ALLE Partien. Deshalb wird das Ergebnis mit kurzer TTL
 * gecacht (config.odds.ttlHours), damit häufige Pipeline-Läufe das Budget nicht
 * aufbrauchen. Ohne ODDS_API_KEY ist das Feature inaktiv (graceful).
 */
import type { MarketOdds } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { fetchText } from "./http.js";
import { alnumKey } from "../util/text.js";

interface OddsOutcome {
  name: string;
  price: number;
}
interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}
interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}
export interface OddsEvent {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBookmaker[];
}

/** Schlüssel einer Partie (Heim|Auswärts) für die Map. */
export function oddsKey(homeName: string, awayName: string): string {
  return `${alnumKey(homeName)}|${alnumKey(awayName)}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Plausibilitäts-Check eines (de-vig-)1X2-Markts: In realen VOR-Anpfiff-Märkten
 * liegt das Remis nie über ~50 % (Maximum real ~35 %). Eine solche Verteilung
 * deutet auf eine In-Play-Aufnahme (z. B. spätes 0:0) oder eine Fehl-Linie hin
 * → verwerfen. Bewusst konservativ (nur das physikalisch Unmögliche), um keine
 * legitimen Linien zu verlieren. Pure Funktion (für Unit-Tests exportiert).
 */
export function isPlausibleMarket(p: { draw: number }): boolean {
  return p.draw <= 0.5;
}

/**
 * Leitet aus einem Odds-Event die de-vig-1X2-Wahrscheinlichkeiten ab.
 * Exportiert für Unit-Tests (reine Funktion, keine Seiteneffekte).
 */
export function deriveMarket(ev: OddsEvent): MarketOdds | null {
  const home: number[] = [];
  const draw: number[] = [];
  const away: number[] = [];
  for (const bk of ev.bookmakers ?? []) {
    const h2h = bk.markets?.find((m) => m.key === "h2h");
    if (!h2h) continue;
    const find = (name: string): number | undefined =>
      h2h.outcomes.find((o) => alnumKey(o.name) === alnumKey(name))?.price;
    const ph = find(ev.home_team);
    const pa = find(ev.away_team);
    const pd = h2h.outcomes.find((o) => /^draw$/i.test(o.name))?.price;
    if (ph && pa && pd) {
      home.push(ph);
      draw.push(pd);
      away.push(pa);
    }
  }
  if (home.length === 0) return null;

  const dH = median(home);
  const dD = median(draw);
  const dA = median(away);
  // De-vig: implizite Wahrscheinlichkeit = 1/Quote, dann auf Σ=1 normieren.
  const iH = 1 / dH;
  const iD = 1 / dD;
  const iA = 1 / dA;
  const sum = iH + iD + iA;
  const r = (x: number): number => Math.round((x / sum) * 10000) / 10000;
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  const probabilities = { home: r(iH), draw: r(iD), away: r(iA) };
  // Unplausible (z. B. In-Play-)Linien verwerfen, statt sie zu speichern.
  if (!isPlausibleMarket(probabilities)) return null;
  return {
    source: "The Odds API",
    updatedAt: new Date().toISOString(),
    bookmakerCount: home.length,
    probabilities,
    decimal: { home: r2(dH), draw: r2(dD), away: r2(dA) },
  };
}

/**
 * Effektive Cache-TTL (Std.): nahe am nächsten Anpfiff (≤ nearKickoffHours)
 * die kürzere nearTtlHours, sonst die Standard-ttlHours. Pure Funktion
 * (für Unit-Tests exportiert).
 */
export function effectiveOddsTtlHours(
  minHoursToKickoff: number | null,
): number {
  const { ttlHours, nearKickoffHours, nearTtlHours } = config.odds;
  if (minHoursToKickoff === null || minHoursToKickoff < 0) return ttlHours;
  return minHoursToKickoff <= nearKickoffHours ? nearTtlHours : ttlHours;
}

/**
 * Lädt die Buchmacher-Quoten je Partie, gekeyt über `oddsKey(home, away)`.
 * Gibt eine leere Map zurück, wenn kein Key gesetzt ist oder der Abruf scheitert.
 *
 * @param minHoursToKickoff Stunden bis zum nächsten Anpfiff (null = keins
 *        anstehend). Steuert die Cache-TTL: nahe am Anpfiff frischere Quoten.
 */
export async function loadOdds(
  minHoursToKickoff: number | null = null,
): Promise<Map<string, MarketOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("[odds] kein ODDS_API_KEY → Buchmacher-Quoten übersprungen");
    return new Map();
  }
  const { sport, regions, untilDate } = config.odds;

  // Nach dem WM-Finale keine Abrufe mehr (spart "Leer"-Credits).
  if (untilDate && Date.now() > new Date(untilDate).getTime()) {
    console.log(`[odds] nach ${untilDate} → WM beendet, keine Quoten-Abrufe`);
    return new Map();
  }
  const ttlH = effectiveOddsTtlHours(minHoursToKickoff);
  const ttlMs = ttlH * 60 * 60 * 1000;
  const cacheKey = `odds:${sport}:${regions}:h2h`;

  const events = await fetchOddsEvents(cacheKey, ttlMs, ttlH, apiKey);
  if (!events) return new Map();
  return eventsToMarketMap(events);
}

/** Holt die Odds-Events aus Cache oder frisch von der API; null bei Fehler. */
async function fetchOddsEvents(
  cacheKey: string,
  ttlMs: number,
  ttlH: number,
  apiKey: string,
): Promise<OddsEvent[] | null> {
  const cached = await cacheGet<OddsEvent[]>(cacheKey, ttlMs);
  if (cached !== null) {
    console.log(`[odds] ${cached.length} Partien aus Cache (kein Credit)`);
    return cached;
  }
  const { sport, regions } = config.odds;
  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds/` +
    `?apiKey=${apiKey}&regions=${regions}&markets=h2h&oddsFormat=decimal`;
  const text = await fetchText(url, { maxRetries: 2, backoffBaseMs: 1000 });
  if (!text) {
    console.warn("[odds] keine Antwort von The Odds API");
    return null;
  }
  let events: OddsEvent[];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn("[odds] unerwartete Antwort:", text.slice(0, 160));
      return null;
    }
    events = parsed as OddsEvent[];
  } catch {
    return null;
  }
  await cacheSet(cacheKey, events);
  console.log(
    `[odds] ${events.length} Partien frisch von The Odds API ` +
      `(1 Credit, TTL ${ttlH}h${ttlH < config.odds.ttlHours ? " — anpfiffnah" : ""})`,
  );
  return events;
}

/** Vor-Anpfiff-Quoten je Partie (In-Play-Linien überspringen). */
function eventsToMarketMap(events: OddsEvent[]): Map<string, MarketOdds> {
  const map = new Map<string, MarketOdds>();
  const nowMs = Date.now();
  for (const ev of events) {
    // Bereits angepfiffene/laufende Spiele liefern In-Play-Linien (z. B. spätes
    // 0:0 → Remis ~1.09), die den Markt verfälschen → überspringen.
    if (ev.commence_time && new Date(ev.commence_time).getTime() <= nowMs) {
      continue;
    }
    const od = deriveMarket(ev);
    if (od) map.set(oddsKey(ev.home_team, ev.away_team), od);
  }
  return map;
}

/** Tauscht Heim/Auswärts in einem MarketOdds (für umgekehrte Paarung). */
export function swapMarket(m: MarketOdds): MarketOdds {
  return {
    ...m,
    probabilities: {
      home: m.probabilities.away,
      draw: m.probabilities.draw,
      away: m.probabilities.home,
    },
    decimal: {
      home: m.decimal.away,
      draw: m.decimal.draw,
      away: m.decimal.home,
    },
  };
}

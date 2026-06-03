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
interface OddsEvent {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBookmaker[];
}

/** Normalisiert einen Teamnamen für den Abgleich (kleinschreibung, ohne
 *  Diakritika/Sonderzeichen). "Bosnia & Herzegovina" → "bosniaherzegovina". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Schlüssel einer Partie (Heim|Auswärts) für die Map. */
export function oddsKey(homeName: string, awayName: string): string {
  return `${norm(homeName)}|${norm(awayName)}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Leitet aus einem Odds-Event die de-vig-1X2-Wahrscheinlichkeiten ab. */
function deriveMarket(ev: OddsEvent): MarketOdds | null {
  const home: number[] = [];
  const draw: number[] = [];
  const away: number[] = [];
  for (const bk of ev.bookmakers ?? []) {
    const h2h = bk.markets?.find((m) => m.key === "h2h");
    if (!h2h) continue;
    const find = (name: string): number | undefined =>
      h2h.outcomes.find((o) => norm(o.name) === norm(name))?.price;
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
  return {
    source: "The Odds API",
    updatedAt: new Date().toISOString(),
    bookmakerCount: home.length,
    probabilities: { home: r(iH), draw: r(iD), away: r(iA) },
    decimal: { home: r2(dH), draw: r2(dD), away: r2(dA) },
  };
}

/**
 * Lädt die Buchmacher-Quoten je Partie, gekeyt über `oddsKey(home, away)`.
 * Gibt eine leere Map zurück, wenn kein Key gesetzt ist oder der Abruf scheitert.
 */
export async function loadOdds(): Promise<Map<string, MarketOdds>> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.log("[odds] kein ODDS_API_KEY → Buchmacher-Quoten übersprungen");
    return new Map();
  }
  const { sport, regions, ttlHours, untilDate } = config.odds;

  // Nach dem WM-Finale keine Abrufe mehr (spart "Leer"-Credits).
  if (untilDate && Date.now() > new Date(untilDate).getTime()) {
    console.log(`[odds] nach ${untilDate} → WM beendet, keine Quoten-Abrufe`);
    return new Map();
  }
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const cacheKey = `odds:${sport}:${regions}:h2h`;

  let events = await cacheGet<OddsEvent[]>(cacheKey, ttlMs);
  if (events === null) {
    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/` +
      `?apiKey=${apiKey}&regions=${regions}&markets=h2h&oddsFormat=decimal`;
    const text = await fetchText(url, { maxRetries: 2, backoffBaseMs: 1000 });
    if (!text) {
      console.warn("[odds] keine Antwort von The Odds API");
      return new Map();
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        console.warn("[odds] unerwartete Antwort:", text.slice(0, 160));
        return new Map();
      }
      events = parsed as OddsEvent[];
    } catch {
      return new Map();
    }
    await cacheSet(cacheKey, events);
    console.log(
      `[odds] ${events.length} Partien frisch von The Odds API (1 Credit verbraucht)`,
    );
  } else {
    console.log(`[odds] ${events.length} Partien aus Cache (kein Credit)`);
  }

  const map = new Map<string, MarketOdds>();
  for (const ev of events) {
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
    decimal: { home: m.decimal.away, draw: m.decimal.draw, away: m.decimal.home },
  };
}

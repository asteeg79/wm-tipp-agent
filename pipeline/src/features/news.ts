/**
 * News-Aggregation pro Team (Abschnitt 8.2):
 * - Pro-Team Google-News-Feeds (DE+EN), fußballstrikt (Pflicht-Fußballbegriff).
 * - Globale Feeds einmal holen, je Team nur bei WORTGENAUEM Namenstreffer.
 * - Dedupe (URL/Titel), deutschsprachige News bevorzugt, dann neueste.
 * - Optionaler KI-Relevanzfilter (1 Call/Team) entfernt Fehltreffer.
 * - Impact-Tagging per Heuristik. Nur Metadaten + Snippet (kein Volltext).
 */
import type { NewsItem, TeamSummary } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { classifyImpact } from "./impactTag.js";
import {
  GLOBAL_FEEDS,
  googleNewsFeeds,
  germanName,
  type NewsLang,
} from "../sources/newsFeeds.js";
import { fetchFeed, type RawNewsItem } from "../sources/rss.js";
import { escapeRe, foldDiacritics } from "../util/text.js";

const FEED_TTL_MS = 60 * 60 * 1000; // 1 h (News sind volatil)

/** Rohitem inkl. Sprachmarkierung (aus dem Quell-Feed). */
type LangTagged = RawNewsItem & { lang: NewsLang };

/**
 * KI-Relevanzfilter: bekommt Teamname + Kandidaten-News und liefert die
 * tatsächlich relevante Teilmenge zurück (gleiche Reihenfolge). Wird per
 * Dependency-Injection übergeben, damit `features/news` nicht von `predict`
 * abhängt. Implementierung: `predict/newsRelevance.ts`.
 */
export type NewsRelevanceFilter = (
  teamName: string,
  items: NewsItem[],
) => Promise<NewsItem[]>;

/**
 * Sortier-Vergleich: deutschsprachige News zuerst, danach jeweils die
 * neuesten zuerst. Pure Funktion (für Unit-Tests exportiert).
 */
export function compareNews(
  a: { lang: NewsLang; publishedAt: string },
  b: { lang: NewsLang; publishedAt: string },
): number {
  if (a.lang !== b.lang) return a.lang === "de" ? -1 : 1;
  return b.publishedAt.localeCompare(a.publishedAt);
}

/** Holt einen Feed mit kurzer Cache-TTL (schont Bandbreite bei vielen Teams). */
async function cachedFeed(url: string, label: string): Promise<RawNewsItem[]> {
  const key = `rss:${url}`;
  const cached = await cacheGet<RawNewsItem[]>(key, FEED_TTL_MS);
  if (cached) return cached;
  const items = await fetchFeed(url, label);
  await cacheSet(key, items);
  return items;
}

/** Lädt alle globalen Feeds einmal (memoisiert pro Lauf). */
export class NewsAggregator {
  private globalItems: LangTagged[] | null = null;

  private async loadGlobal(): Promise<LangTagged[]> {
    if (this.globalItems) return this.globalItems;
    const all: LangTagged[] = [];
    for (const f of GLOBAL_FEEDS) {
      const items = await cachedFeed(f.url, f.label);
      all.push(...items.map((it) => ({ ...it, lang: f.lang })));
    }
    this.globalItems = all;
    return all;
  }

  /**
   * Relevante, deduplizierte, getaggte News für ein Team.
   * @param relevanceFilter optionaler KI-Filter (1 Call/Team), der Fehltreffer
   *        (andere Sportarten/Teams) aussortiert. Fehlt er, greift nur die
   *        Heuristik (striktes Matching + Quellen).
   */
  async forTeam(
    team: TeamSummary,
    relevanceFilter?: NewsRelevanceFilter,
  ): Promise<NewsItem[]> {
    // 1) Pro-Team Google-News-Feeds (bereits team-spezifisch + fußballstrikt).
    const perTeam: LangTagged[] = [];
    for (const f of googleNewsFeeds(team.name)) {
      const items = await cachedFeed(f.url, f.label);
      perTeam.push(...items.map((it) => ({ ...it, lang: f.lang })));
    }

    // 2) Globale Feeds: wortgenauer Treffer auf den englischen ODER deutschen
    //    Teamnamen (deutsche Feeds schreiben „Deutschland" statt „Germany").
    const global = await this.loadGlobal();
    const deName = germanName(team.name);
    const matchedGlobal = global.filter(
      (it) =>
        matchesTeam(it, team.name) ||
        (deName !== team.name && matchesTeam(it, deName)),
    );

    // 3) Zusammenführen, dedupen, deutsch-zuerst sortieren, kappen.
    const merged = [...perTeam, ...matchedGlobal];
    const deduped = dedupe(merged);
    deduped.sort(compareNews); // deutschsprachige News bevorzugt
    let candidates: NewsItem[] = deduped.slice(0, CANDIDATE_CAP).map((it) => ({
      title: it.title,
      source: it.source,
      url: it.url,
      publishedAt: it.publishedAt,
      snippet: it.snippet,
      impactTag: classifyImpact(it.title, it.snippet),
    }));

    // 4) Optionaler KI-Relevanzfilter (entfernt Fehltreffer). Bei Fehler
    //    liefert der Filter die Eingabe unverändert zurück (graceful).
    if (relevanceFilter) {
      candidates = await relevanceFilter(team.name, candidates);
    }

    return candidates.slice(0, config.maxNewsPerTeam);
  }
}

/** Obergrenze an Kandidaten vor dem (KI-)Filter — begrenzt Tokens/Kosten. */
const CANDIDATE_CAP = 30;

/**
 * Wortgenauer Treffer des vollständigen Teamnamens in Titel/Snippet.
 * Verhindert Substring-Fehltreffer (z. B. „France" in „Tour de France");
 * Diakritika werden ignoriert. Hinweis: globale DE-Feeds führen englische
 * Teamnamen selten — der primäre Kanal ist die team-spezifische Google-Suche.
 */
export function matchesTeam(it: RawNewsItem, teamName: string): boolean {
  const hay = foldDiacritics(`${it.title} ${it.snippet}`);
  const name = foldDiacritics(teamName);
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(name)}(?:[^a-z0-9]|$)`);
  return re.test(hay);
}

/** Dedupe nach normalisierter URL und normalisiertem Titel. */
function dedupe<T extends RawNewsItem>(items: T[]): T[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const u = normalizeUrl(it.url);
    const t = it.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenUrl.has(u) || seenTitle.has(t)) continue;
    seenUrl.add(u);
    seenTitle.add(t);
    out.push(it);
  }
  return out;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

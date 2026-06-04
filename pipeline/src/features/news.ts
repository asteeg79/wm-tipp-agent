/**
 * News-Aggregation pro Team (Abschnitt 8.2):
 * - Globale Feeds einmal holen, pro Team relevant filtern.
 * - Pro-Team Google-News-Feeds (DE+EN) holen.
 * - Stichwort-Match (Teamname/Aliasse), Dedupe (URL/Titel), N neueste behalten.
 * - Impact-Tagging per Heuristik. Nur Metadaten + Snippet (kein Volltext).
 */
import type { NewsItem, TeamSummary } from "@wm/shared";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import { classifyImpact } from "./impactTag.js";
import { GLOBAL_FEEDS, googleNewsFeeds } from "../sources/newsFeeds.js";
import { fetchFeed, type RawNewsItem } from "../sources/rss.js";

const FEED_TTL_MS = 60 * 60 * 1000; // 1 h (News sind volatil)

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
  private globalItems: RawNewsItem[] | null = null;

  private async loadGlobal(): Promise<RawNewsItem[]> {
    if (this.globalItems) return this.globalItems;
    const all: RawNewsItem[] = [];
    for (const f of GLOBAL_FEEDS) {
      all.push(...(await cachedFeed(f.url, f.label)));
    }
    this.globalItems = all;
    return all;
  }

  /** Relevante, deduplizierte, getaggte News für ein Team. */
  async forTeam(team: TeamSummary): Promise<NewsItem[]> {
    const aliases = teamAliases(team);

    // 1) Pro-Team Google-News-Feeds (bereits team-spezifisch → kein Filter).
    const perTeam: RawNewsItem[] = [];
    for (const f of googleNewsFeeds(team.name)) {
      perTeam.push(...(await cachedFeed(f.url, f.label)));
    }

    // 2) Globale Feeds nach Teamname/Alias filtern.
    const global = await this.loadGlobal();
    const matchedGlobal = global.filter((it) => matchesTeam(it, aliases));

    // 3) Zusammenführen, dedupen, taggen, sortieren, kürzen.
    const merged = [...perTeam, ...matchedGlobal];
    const deduped = dedupe(merged);
    const tagged: NewsItem[] = deduped.map((it) => ({
      title: it.title,
      source: it.source,
      url: it.url,
      publishedAt: it.publishedAt,
      snippet: it.snippet,
      impactTag: classifyImpact(it.title, it.snippet),
    }));
    tagged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return tagged.slice(0, config.maxNewsPerTeam);
  }
}

/** Such-Aliasse: voller Name + signifikante Wortteile. */
function teamAliases(team: TeamSummary): string[] {
  const names = new Set<string>([team.name.toLowerCase()]);
  // Längstes Wort als zusätzlicher Treffer (z. B. "Korea", "Republic").
  const words = team.name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  for (const w of words) names.add(w);
  return [...names];
}

const STOPWORDS = new Set([
  "republic",
  "north",
  "south",
  "saudi",
  "united",
  "states",
  "and",
  "the",
]);

function matchesTeam(it: RawNewsItem, aliases: string[]): boolean {
  const hay = `${it.title} ${it.snippet}`.toLowerCase();
  return aliases.some((a) => hay.includes(a));
}

/** Dedupe nach normalisierter URL und normalisiertem Titel. */
function dedupe(items: RawNewsItem[]): RawNewsItem[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: RawNewsItem[] = [];
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

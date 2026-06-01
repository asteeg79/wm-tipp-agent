/**
 * Generischer RSS/Atom-Parser (fast-xml-parser), serverseitig genutzt →
 * kein CORS-Problem (Abschnitt 6). Liefert normalisierte RawNewsItem[].
 */
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./http.js";

export interface RawNewsItem {
  title: string;
  url: string;
  publishedAt: string; // ISO-8601
  snippet: string;
  source: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  // Manche Feeds (z. B. Guardian) enthalten viele HTML-Entities → Limit hoch.
  numberParseOptions: { leadingZeros: false, hex: false },
  processEntities: false,
});

/** Holt + parst einen Feed. Gibt bei Fehler/404 ein leeres Array zurück. */
export async function fetchFeed(
  url: string,
  sourceLabel: string,
): Promise<RawNewsItem[]> {
  let xml: string | null;
  try {
    xml = await fetchText(url, { maxRetries: 2, backoffBaseMs: 800 });
  } catch (err) {
    console.warn(`[rss] Feed nicht erreichbar (${sourceLabel}): ${String(err)}`);
    return [];
  }
  if (!xml) return [];

  try {
    return parseFeedXml(xml, sourceLabel);
  } catch (err) {
    console.warn(`[rss] Parse-Fehler (${sourceLabel}): ${String(err)}`);
    return [];
  }
}

/** Parst RSS-2.0- oder Atom-XML in normalisierte Items. */
export function parseFeedXml(xml: string, sourceLabel: string): RawNewsItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const out: RawNewsItem[] = [];

  // RSS 2.0: rss.channel.item[]
  const rss = doc["rss"] as { channel?: { item?: unknown } } | undefined;
  const channelSource = readChannelTitle(rss?.channel) ?? sourceLabel;
  if (rss?.channel?.item) {
    for (const it of toArray(rss.channel.item)) {
      const item = it as Record<string, unknown>;
      const parsed = fromRssItem(item, channelSource);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  // Atom: feed.entry[]
  const feed = doc["feed"] as { entry?: unknown; title?: unknown } | undefined;
  if (feed?.entry) {
    const src = textOf(feed.title) || sourceLabel;
    for (const e of toArray(feed.entry)) {
      const entry = e as Record<string, unknown>;
      const parsed = fromAtomEntry(entry, src);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function fromRssItem(
  item: Record<string, unknown>,
  source: string,
): RawNewsItem | null {
  const rawTitle = stripHtml(textOf(item["title"]));
  const url = textOf(item["link"]);
  if (!rawTitle || !url) return null;
  const pub = textOf(item["pubDate"]) || textOf(item["dc:date"]);
  const desc = textOf(item["description"]);

  // Google-News-Items: explizites <source>, sonst Titel-Suffix " - Quelle".
  const explicitSource = textOf(item["source"]);
  const isGoogle = /google news/i.test(source);
  let title = rawTitle;
  let resolvedSource = source;
  if (isGoogle) {
    if (explicitSource) {
      resolvedSource = explicitSource;
    } else {
      const m = /^(.*)\s[-–]\s([^-–]{2,40})$/.exec(rawTitle);
      if (m) {
        title = m[1]!.trim();
        resolvedSource = m[2]!.trim();
      } else {
        resolvedSource = hostLabel(source, url);
      }
    }
  }

  return {
    title,
    url,
    publishedAt: toIso(pub),
    snippet: truncate(stripHtml(desc), 280),
    source: resolvedSource,
  };
}

function fromAtomEntry(
  entry: Record<string, unknown>,
  source: string,
): RawNewsItem | null {
  const title = textOf(entry["title"]);
  const link = entry["link"];
  let url = "";
  if (Array.isArray(link)) {
    const alt = link.find(
      (l) => (l as Record<string, unknown>)["@_rel"] !== "self",
    ) as Record<string, unknown> | undefined;
    url = textOf(alt?.["@_href"]) || textOf((link[0] as Record<string, unknown>)?.["@_href"]);
  } else if (link && typeof link === "object") {
    url = textOf((link as Record<string, unknown>)["@_href"]);
  } else {
    url = textOf(link);
  }
  if (!title || !url) return null;
  const pub = textOf(entry["published"]) || textOf(entry["updated"]);
  const summary = textOf(entry["summary"]) || textOf(entry["content"]);
  return {
    title: stripHtml(title),
    url,
    publishedAt: toIso(pub),
    snippet: truncate(stripHtml(summary), 280),
    source: hostLabel(source, url),
  };
}

// --- Helfer ----------------------------------------------------------------

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

function readChannelTitle(channel: unknown): string | null {
  if (channel && typeof channel === "object") {
    const t = textOf((channel as Record<string, unknown>)["title"]);
    return t || null;
  }
  return null;
}

/** Extrahiert Text aus String, {#text}, oder CDATA-Objekt. */
function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const t = (v as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t;
  }
  return "";
}

function stripHtml(s: string): string {
  // Reihenfolge wichtig: ZUERST Entities dekodieren, DANN Tags entfernen.
  // Google-News-Snippets enthalten escapte Tags (&lt;a href=…&gt;) — würde man
  // erst strippen und dann dekodieren, blieben echte <a>-Tags als Text übrig.
  const decoded = s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  // Tags entfernen (zweimal, falls durch Dekodierung neue Tags entstanden sind).
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function toIso(dateStr: string): string {
  if (!dateStr) return new Date(0).toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/**
 * Quellen-Label: Google-News-Items haben oft " - Quelle" im Titel; sonst
 * Hostname. Bevorzugt den übergebenen Channel-Titel, fällt auf Host zurück.
 */
function hostLabel(channelSource: string, url: string): string {
  if (channelSource && !/google news/i.test(channelSource)) return channelSource;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return channelSource || "news";
  }
}

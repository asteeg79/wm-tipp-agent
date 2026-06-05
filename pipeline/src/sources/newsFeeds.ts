/**
 * News-Quellen-Konfiguration (Abschnitt 8.2 / 20.2).
 * - Globale Feeds: bewusst auf die **wichtigsten** Quellen beschränkt, mit
 *   klarem Schwerpunkt auf **deutschsprachigen** Medien (kicker, Sportschau,
 *   n-tv, Spiegel) + EINER internationalen Rückfallquelle (BBC) für Teams mit
 *   wenig deutscher Berichterstattung.
 * - Pro-Team: Google-News-RSS-Suche in DE + EN (universell für alle 48 Teams).
 *
 * Jeder Feed trägt eine Sprachmarkierung (`lang`), damit die Aggregation in
 * `features/news.ts` deutschsprachige Treffer bevorzugen kann.
 */

export type NewsLang = "de" | "en";

export interface FeedSource {
  url: string;
  label: string;
  lang: NewsLang;
}

/**
 * Allgemeine, team-übergreifende Feeds (einmal pro Lauf geholt, dann je Team
 * nach Name/Alias gefiltert). Reduziert auf die wichtigsten Quellen.
 */
export const GLOBAL_FEEDS: FeedSource[] = [
  // Deutschsprachig (priorisiert)
  { url: "https://newsfeed.kicker.de/news/wm", label: "kicker", lang: "de" },
  {
    url: "https://newsfeed.kicker.de/news/fussball",
    label: "kicker",
    lang: "de",
  },
  {
    url: "https://www.sportschau.de/fussball/fifa-wm-2026/index~rss2.xml",
    label: "Sportschau WM 2026",
    lang: "de",
  },
  { url: "https://www.n-tv.de/sport/fussball/rss", label: "n-tv", lang: "de" },
  {
    url: "https://www.spiegel.de/sport/fussball/index.rss",
    label: "Spiegel",
    lang: "de",
  },
  // Internationale Rückfallquelle (eine, für gering abgedeckte Teams)
  {
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    label: "BBC Sport",
    lang: "en",
  },
];

/** Baut die zwei Google-News-RSS-Such-URLs (DE + EN) für ein Team. */
export function googleNewsFeeds(teamName: string): FeedSource[] {
  const q = encodeURIComponent(`"${teamName}"`);
  return [
    {
      url: `https://news.google.com/rss/search?q=${q}+(Nationalmannschaft+OR+Fu%C3%9Fball+OR+WM)&hl=de&gl=DE&ceid=DE:de`,
      label: "Google News",
      lang: "de",
    },
    {
      url: `https://news.google.com/rss/search?q=${q}+(national+team+OR+World+Cup)&hl=en-US&gl=US&ceid=US:en`,
      label: "Google News",
      lang: "en",
    },
  ];
}

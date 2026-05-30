/**
 * News-Quellen-Konfiguration (Abschnitt 8.2 / 20.2).
 * - Globale Feeds: kicker, Sportschau, BBC, Guardian, FIFA (einmal pro Lauf).
 * - Pro-Team: Google-News-RSS-Suche in DE + EN (universell für alle 48 Teams).
 */

/** Allgemeine, team-übergreifende Feeds. */
export const GLOBAL_FEEDS: { url: string; label: string }[] = [
  { url: "https://newsfeed.kicker.de/news/wm", label: "kicker" },
  { url: "https://newsfeed.kicker.de/news/fussball", label: "kicker" },
  {
    url: "https://www.sportschau.de/fussball/index~rss2.xml",
    label: "Sportschau",
  },
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", label: "BBC Sport" },
  {
    url: "https://www.theguardian.com/football/rss",
    label: "The Guardian",
  },
];

/** Baut die zwei Google-News-RSS-Such-URLs (DE + EN) für ein Team. */
export function googleNewsFeeds(teamName: string): {
  url: string;
  label: string;
}[] {
  const q = encodeURIComponent(`"${teamName}"`);
  return [
    {
      url: `https://news.google.com/rss/search?q=${q}+(Nationalmannschaft+OR+Fu%C3%9Fball+OR+WM)&hl=de&gl=DE&ceid=DE:de`,
      label: "Google News",
    },
    {
      url: `https://news.google.com/rss/search?q=${q}+(national+team+OR+World+Cup)&hl=en-US&gl=US&ceid=US:en`,
      label: "Google News",
    },
  ];
}

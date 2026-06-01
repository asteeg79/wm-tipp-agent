/**
 * News-Quellen-Konfiguration (Abschnitt 8.2 / 20.2).
 * - Globale Feeds: kicker, Sportschau, BBC, Guardian, FIFA (einmal pro Lauf).
 * - Pro-Team: Google-News-RSS-Suche in DE + EN (universell für alle 48 Teams).
 */

/**
 * Allgemeine, team-übergreifende Feeds. Werden einmal pro Lauf geholt und dann
 * je Team nach Name/Alias gefiltert. Alle URLs sind live als RSS verifiziert
 * (Stand 2026-05); tote/HTML-Antworten werden vom rss-Parser ohnehin
 * fehlertolerant übersprungen.
 */
export const GLOBAL_FEEDS: { url: string; label: string }[] = [
  // Deutsch
  { url: "https://newsfeed.kicker.de/news/wm", label: "kicker" },
  { url: "https://newsfeed.kicker.de/news/fussball", label: "kicker" },
  {
    url: "https://www.sportschau.de/fussball/index~rss2.xml",
    label: "Sportschau",
  },
  {
    url: "https://www.sportschau.de/fussball/fifa-wm-2026/index~rss2.xml",
    label: "Sportschau WM 2026",
  },
  { url: "https://www.n-tv.de/sport/rss", label: "n-tv Sport" },
  { url: "https://www.n-tv.de/sport/fussball/rss", label: "n-tv Fußball" },
  { url: "https://www.spiegel.de/sport/fussball/index.rss", label: "Spiegel" },
  // International
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", label: "BBC Sport" },
  { url: "https://www.theguardian.com/football/rss", label: "The Guardian" },
  { url: "https://www.espn.com/espn/rss/soccer/news", label: "ESPN" },
  { url: "https://www.skysports.com/rss/12040", label: "Sky Sports" },
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

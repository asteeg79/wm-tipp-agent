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

/**
 * Deutsche Ländernamen für die DE-Suche. Wichtig: Deutsche Fußballartikel
 * schreiben „Deutschland"/„Frankreich" usw. — die Suche mit dem ENGLISCHEN
 * Namen („Germany") liefert in deutschen Quellen kaum/falsche Treffer. Fehlt
 * ein Name hier, wird der englische verwendet (für viele identisch).
 */
const GERMAN_NAMES: Record<string, string> = {
  germany: "Deutschland",
  france: "Frankreich",
  spain: "Spanien",
  italy: "Italien",
  netherlands: "Niederlande",
  belgium: "Belgien",
  croatia: "Kroatien",
  switzerland: "Schweiz",
  denmark: "Dänemark",
  austria: "Österreich",
  "czech republic": "Tschechien",
  czechia: "Tschechien",
  poland: "Polen",
  norway: "Norwegen",
  sweden: "Schweden",
  scotland: "Schottland",
  turkey: "Türkei",
  serbia: "Serbien",
  hungary: "Ungarn",
  greece: "Griechenland",
  brazil: "Brasilien",
  argentina: "Argentinien",
  colombia: "Kolumbien",
  morocco: "Marokko",
  "south africa": "Südafrika",
  "ivory coast": "Elfenbeinküste",
  algeria: "Algerien",
  egypt: "Ägypten",
  "cape verde": "Kap Verde",
  "dr congo": "DR Kongo",
  tunisia: "Tunesien",
  cameroon: "Kamerun",
  "south korea": "Südkorea",
  "saudi arabia": "Saudi-Arabien",
  qatar: "Katar",
  iraq: "Irak",
  jordan: "Jordanien",
  uzbekistan: "Usbekistan",
  australia: "Australien",
  "new zealand": "Neuseeland",
  canada: "Kanada",
  mexico: "Mexiko",
  "united states": "USA",
  usa: "USA",
  "bosnia & herzegovina": "Bosnien-Herzegowina",
};

/** Deutscher Ländername (Fallback: englischer Name). */
export function germanName(name: string): string {
  return GERMAN_NAMES[name.toLowerCase()] ?? name;
}

/**
 * Baut die zwei Google-News-RSS-Such-URLs (DE + EN) für ein Team.
 *
 * - DE-Suche nutzt den **deutschen** Ländernamen (sonst kaum Treffer, s. o.).
 * - Der Name wird mit einer **verpflichtenden** Fußball-Begriffsgruppe
 *   UND-verknüpft (Leerzeichen = AND), damit z. B. „Tour de France" (enthält
 *   „France", aber keinen Fußballbegriff) nicht matcht. Negativ-Keywords
 *   schließen andere Sportarten + Frauenteams aus.
 */
export function googleNewsFeeds(teamName: string): FeedSource[] {
  const qDe = encodeURIComponent(`"${germanName(teamName)}"`);
  const qEn = encodeURIComponent(`"${teamName}"`);
  const deFootball = encodeURIComponent(
    "(Fußball OR Fussball OR Nationalmannschaft OR Länderspiel OR Nationalelf OR WM-Kader)",
  );
  const deExclude = encodeURIComponent(
    "-Radsport -Tour -Tennis -Formel -Basketball -Handball -Olympia -Eishockey -Frauen",
  );
  const enFootball = encodeURIComponent(
    '(football OR soccer OR "national team")',
  );
  const enExclude = encodeURIComponent(
    "-cycling -tennis -NFL -NBA -cricket -rugby -F1 -golf -women",
  );
  return [
    {
      url: `https://news.google.com/rss/search?q=${qDe}+${deFootball}+${deExclude}&hl=de&gl=DE&ceid=DE:de`,
      label: "Google News",
      lang: "de",
    },
    {
      url: `https://news.google.com/rss/search?q=${qEn}+${enFootball}+${enExclude}&hl=en-US&gl=US&ceid=US:en`,
      label: "Google News",
      lang: "en",
    },
  ];
}

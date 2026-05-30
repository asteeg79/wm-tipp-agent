/**
 * Defensiver Parser für das openfootball **Football.TXT**-Format.
 * Liest Länderspiel-Ergebnisse aus Dateien wie:
 *   = Friendlies 2025
 *   Wed Jun/4 2025
 *     Germany    2-1 (1-0)  Scotland
 *
 * Erfasst Datum, beide Teams und das Endergebnis. Nicht passende Zeilen
 * (Kommentare, Runden-/Gruppen-Header, Platzhalter) werden übersprungen.
 */

export interface ParsedMatch {
  /** YYYY-MM-DD */
  date: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Datumskopf: optionaler Wochentag, Monat, Tag (Leerzeichen ODER Slash),
// optional Jahr. Erfasst "Sat Jan 18", "Thu Sep 5 2025" und "Jun/4".
const DATE_RE =
  /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s/]+(\d{1,2})(?:\s+(\d{4}))?$/i;
// Match-Zeile: TeamA  g-g (ht)?  TeamB
const MATCH_RE =
  /^\s+(.+?)\s+(\d{1,2})-(\d{1,2})(?:\s+\(\d{1,2}-\d{1,2}\))?\s+(.+?)\s*$/;
const YEAR_RE = /\b(20\d{2})\b/;

/** Bereinigt einen Teamnamen (Venue-/Kommentar-Suffixe entfernen). */
function cleanTeam(name: string): string {
  return name
    .split(/\s+@|\s+#|\s+\[/)[0]!
    .replace(/\s+\(.*?\)\s*$/, "")
    .trim();
}

export function parseFootballTxt(
  text: string,
  defaultYear: number,
): ParsedMatch[] {
  const out: ParsedMatch[] = [];
  let year = defaultYear;
  let month = 0;
  let day = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Match-Zeile zuerst prüfen (beginnt eingerückt mit Score).
    const mm = MATCH_RE.exec(line);
    if (mm && month && day) {
      const teamA = cleanTeam(mm[1]!);
      const scoreA = Number(mm[2]);
      const scoreB = Number(mm[3]);
      const teamB = cleanTeam(mm[4]!);
      if (teamA && teamB && teamA !== teamB) {
        out.push({
          date: `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          teamA,
          teamB,
          scoreA,
          scoreB,
        });
      }
      continue;
    }

    // Datumskopf?
    const dm = DATE_RE.exec(line.trim());
    if (dm) {
      const mon = MONTHS[dm[1]!.toLowerCase()];
      if (mon) {
        month = mon;
        day = Number(dm[2]);
        if (dm[3]) year = Number(dm[3]);
      }
      continue;
    }

    // Standalone-Jahr (z. B. Saisonwechsel) übernehmen.
    const ym = YEAR_RE.exec(line);
    if (ym && !MATCH_RE.test(line)) year = Number(ym[1]);
  }

  return out;
}

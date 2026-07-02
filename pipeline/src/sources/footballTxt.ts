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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
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

interface DateState {
  year: number;
  month: number;
  day: number;
}

/** Match-Zeile → ParsedMatch, sofern ein gültiges Datum aktiv + Teams valide. */
function parseMatchLine(line: string, s: DateState): ParsedMatch | null {
  const mm = MATCH_RE.exec(line);
  if (!mm || !s.month || !s.day) return null;
  const teamA = cleanTeam(mm[1]!);
  const teamB = cleanTeam(mm[4]!);
  if (!teamA || !teamB || teamA === teamB) return null;
  const date = `${s.year.toString().padStart(4, "0")}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`;
  return { date, teamA, teamB, scoreA: Number(mm[2]), scoreB: Number(mm[3]) };
}

/** Datumskopf → aktualisiert month/day/year in-place; true, wenn erkannt. */
function applyDateHeader(line: string, s: DateState): boolean {
  const dm = DATE_RE.exec(line.trim());
  if (!dm) return false;
  const mon = MONTHS[dm[1]!.toLowerCase()];
  if (mon) {
    s.month = mon;
    s.day = Number(dm[2]);
    if (dm[3]) s.year = Number(dm[3]);
  }
  return true;
}

export function parseFootballTxt(
  text: string,
  defaultYear: number,
): ParsedMatch[] {
  const out: ParsedMatch[] = [];
  const s: DateState = { year: defaultYear, month: 0, day: 0 };

  for (const raw of text.split(/\r?\n/)) {
    // trimEnd() statt /\s+$/: Letzteres backtrackt bei internen Whitespace-
    // Läufen ohne abschließenden Space quadratisch (O(n²)); trimEnd ist linear.
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const match = parseMatchLine(line, s);
    if (match) {
      out.push(match);
      continue;
    }
    // War es eine Match-Zeile (nur ohne gültiges Datum/Teams)? → nicht als
    // Datumskopf oder Standalone-Jahr fehldeuten.
    if (MATCH_RE.test(line)) continue;
    if (applyDateHeader(line, s)) continue;

    // Standalone-Jahr (z. B. Saisonwechsel) übernehmen.
    const ym = YEAR_RE.exec(line);
    if (ym) s.year = Number(ym[1]);
  }

  return out;
}

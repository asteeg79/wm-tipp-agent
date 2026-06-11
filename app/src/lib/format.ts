/**
 * Formatierungs-Helfer: lokale Anstoßzeit, relative „vor X"-Angabe, Punkte.
 */
import i18n from "../i18n.js";

/** Anstoßzeit in der lokalen Zeitzone des Nutzers. */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(i18n.language, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kurzes Datum (ohne Uhrzeit). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** „vor X" relativ zu jetzt (grobe Granularität). */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hrs = Math.round(min / 60);
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
  return rtf.format(-Math.round(hrs / 24), "day");
}

/** Punkte aus einem Ergebnis (3/1/0). */
export function pointsFor(goalsFor: number, goalsAgainst: number): number {
  if (goalsFor > goalsAgainst) return 3;
  if (goalsFor === goalsAgainst) return 1;
  return 0;
}

/**
 * Wahrscheinlichkeit 0..1 → Prozentstring ("57%", digits>0: "57.1%").
 * null/undefined → "–" (noch keine Daten). EINZIGE Prozent-Formatierung der
 * App — vorher 8× lokal definiert.
 */
export function formatPercent(
  x: number | null | undefined,
  digits = 0,
): string {
  if (x === null || x === undefined) return "–";
  const v = x * 100;
  return `${digits === 0 ? Math.round(v) : v.toFixed(digits)}%`;
}

/** Zahl mit festen Nachkommastellen ("0.142"); null/undefined → "–". */
export function formatDecimal(
  x: number | null | undefined,
  digits = 3,
): string {
  return x === null || x === undefined ? "–" : x.toFixed(digits);
}

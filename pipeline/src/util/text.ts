/**
 * Zentrale Text-Normalisierung. Vorher existierten drei verschiedene
 * `norm()`-Funktionen mit gleichem Namen, aber UNTERSCHIEDLICHER Semantik
 * (news/oddsApi/countries) — hier haben sie sprechende Namen.
 */

/** Kleinbuchstaben + Diakritika entfernen ("Curaçao" → "curacao"). */
export function foldDiacritics(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Aggressiver Vergleichsschlüssel: foldDiacritics + alles außer [a-z0-9]
 * entfernen ("Bosnia & Herzegovina" → "bosniaherzegovina").
 */
export function alnumKey(s: string): string {
  return foldDiacritics(s).replace(/[^a-z0-9]/g, "");
}

/** Escaped Regex-Sonderzeichen für die Verwendung in `new RegExp(...)`. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

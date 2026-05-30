/**
 * Referenztabelle Nationenname → ISO-3166-alpha2 (für Flaggen via flagcdn)
 * + FIFA-3-Buchstaben-Code (Anzeige). openfootball liefert nur Namen, daher
 * ist dieses Mapping nötig (nicht aus den Daten ableitbar).
 *
 * Abdeckung: alle realistischen WM-2026-Teilnehmer (UEFA, CONMEBOL, CONCACAF,
 * CAF, AFC, OFC + Playoff-Kandidaten). Unbekannte Namen werden vom Provider
 * geloggt und fallen auf einen Slug + Erst-3-Buchstaben zurück.
 */

export interface CountryInfo {
  /** ISO-3166-1 alpha-2 (lowercase), für flagcdn. */
  iso2: string;
  /** FIFA-Ländercode (Anzeige). */
  code: string;
}

/** Schlüssel sind normalisierte (lowercase) Ländernamen. */
const COUNTRIES: Record<string, CountryInfo> = {
  // Gastgeber
  "united states": { iso2: "us", code: "USA" },
  usa: { iso2: "us", code: "USA" },
  canada: { iso2: "ca", code: "CAN" },
  mexico: { iso2: "mx", code: "MEX" },
  // UEFA
  germany: { iso2: "de", code: "GER" },
  france: { iso2: "fr", code: "FRA" },
  spain: { iso2: "es", code: "ESP" },
  england: { iso2: "gb-eng", code: "ENG" },
  portugal: { iso2: "pt", code: "POR" },
  netherlands: { iso2: "nl", code: "NED" },
  belgium: { iso2: "be", code: "BEL" },
  italy: { iso2: "it", code: "ITA" },
  croatia: { iso2: "hr", code: "CRO" },
  switzerland: { iso2: "ch", code: "SUI" },
  denmark: { iso2: "dk", code: "DEN" },
  austria: { iso2: "at", code: "AUT" },
  "czech republic": { iso2: "cz", code: "CZE" },
  czechia: { iso2: "cz", code: "CZE" },
  poland: { iso2: "pl", code: "POL" },
  serbia: { iso2: "rs", code: "SRB" },
  ukraine: { iso2: "ua", code: "UKR" },
  scotland: { iso2: "gb-sct", code: "SCO" },
  wales: { iso2: "gb-wls", code: "WAL" },
  turkey: { iso2: "tr", code: "TUR" },
  "türkiye": { iso2: "tr", code: "TUR" },
  norway: { iso2: "no", code: "NOR" },
  sweden: { iso2: "se", code: "SWE" },
  hungary: { iso2: "hu", code: "HUN" },
  slovakia: { iso2: "sk", code: "SVK" },
  slovenia: { iso2: "si", code: "SVN" },
  romania: { iso2: "ro", code: "ROU" },
  greece: { iso2: "gr", code: "GRE" },
  republic_of_ireland: { iso2: "ie", code: "IRL" },
  "republic of ireland": { iso2: "ie", code: "IRL" },
  ireland: { iso2: "ie", code: "IRL" },
  "northern ireland": { iso2: "gb-nir", code: "NIR" },
  albania: { iso2: "al", code: "ALB" },
  "bosnia and herzegovina": { iso2: "ba", code: "BIH" },
  "bosnia & herzegovina": { iso2: "ba", code: "BIH" },
  "bosnia-herzegovina": { iso2: "ba", code: "BIH" },
  "north macedonia": { iso2: "mk", code: "MKD" },
  georgia: { iso2: "ge", code: "GEO" },
  finland: { iso2: "fi", code: "FIN" },
  iceland: { iso2: "is", code: "ISL" },
  // CONMEBOL
  argentina: { iso2: "ar", code: "ARG" },
  brazil: { iso2: "br", code: "BRA" },
  uruguay: { iso2: "uy", code: "URU" },
  colombia: { iso2: "co", code: "COL" },
  ecuador: { iso2: "ec", code: "ECU" },
  paraguay: { iso2: "py", code: "PAR" },
  peru: { iso2: "pe", code: "PER" },
  chile: { iso2: "cl", code: "CHI" },
  bolivia: { iso2: "bo", code: "BOL" },
  venezuela: { iso2: "ve", code: "VEN" },
  // CONCACAF
  "costa rica": { iso2: "cr", code: "CRC" },
  panama: { iso2: "pa", code: "PAN" },
  jamaica: { iso2: "jm", code: "JAM" },
  honduras: { iso2: "hn", code: "HON" },
  "el salvador": { iso2: "sv", code: "SLV" },
  guatemala: { iso2: "gt", code: "GUA" },
  curacao: { iso2: "cw", code: "CUW" },
  "curaçao": { iso2: "cw", code: "CUW" },
  haiti: { iso2: "ht", code: "HAI" },
  // CAF
  morocco: { iso2: "ma", code: "MAR" },
  senegal: { iso2: "sn", code: "SEN" },
  tunisia: { iso2: "tn", code: "TUN" },
  algeria: { iso2: "dz", code: "ALG" },
  egypt: { iso2: "eg", code: "EGY" },
  nigeria: { iso2: "ng", code: "NGA" },
  cameroon: { iso2: "cm", code: "CMR" },
  ghana: { iso2: "gh", code: "GHA" },
  "ivory coast": { iso2: "ci", code: "CIV" },
  "côte d'ivoire": { iso2: "ci", code: "CIV" },
  "south africa": { iso2: "za", code: "RSA" },
  mali: { iso2: "ml", code: "MLI" },
  "cape verde": { iso2: "cv", code: "CPV" },
  "cabo verde": { iso2: "cv", code: "CPV" },
  "dr congo": { iso2: "cd", code: "COD" },
  "democratic republic of the congo": { iso2: "cd", code: "COD" },
  "burkina faso": { iso2: "bf", code: "BFA" },
  angola: { iso2: "ao", code: "ANG" },
  // AFC
  japan: { iso2: "jp", code: "JPN" },
  "south korea": { iso2: "kr", code: "KOR" },
  "korea republic": { iso2: "kr", code: "KOR" },
  "iran": { iso2: "ir", code: "IRN" },
  "ir iran": { iso2: "ir", code: "IRN" },
  australia: { iso2: "au", code: "AUS" },
  "saudi arabia": { iso2: "sa", code: "KSA" },
  qatar: { iso2: "qa", code: "QAT" },
  iraq: { iso2: "iq", code: "IRQ" },
  uzbekistan: { iso2: "uz", code: "UZB" },
  jordan: { iso2: "jo", code: "JOR" },
  "united arab emirates": { iso2: "ae", code: "UAE" },
  china: { iso2: "cn", code: "CHN" },
  "china pr": { iso2: "cn", code: "CHN" },
  // OFC
  "new zealand": { iso2: "nz", code: "NZL" },
};

/** Normalisiert einen Ländernamen für den Lookup. */
function norm(name: string): string {
  return name.trim().toLowerCase();
}

/** Liefert CountryInfo oder null (unbekannt). */
export function lookupCountry(name: string): CountryInfo | null {
  return COUNTRIES[norm(name)] ?? null;
}

/** Stabile, URL-taugliche Team-ID aus dem Namen (Fallback-Identität). */
export function teamSlug(name: string): string {
  return norm(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Kanonische, quellenübergreifende Team-ID. Nutzt den FIFA-Code (kennt
 * Alias-Schreibweisen wie "South Korea"/"Korea Republic" → KOR), damit
 * openfootball- und API-Football-Namen denselben Schlüssel ergeben.
 * Fallback bei unbekanntem Land: Slug des Namens.
 */
export function canonicalId(name: string): string {
  return lookupCountry(name)?.code ?? teamSlug(name);
}

/** Flag-URL via flagcdn (w320). */
export function flagUrl(iso2: string): string {
  return `https://flagcdn.com/w320/${iso2}.png`;
}

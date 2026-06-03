/**
 * Konföderation + "Major-Nation"-Status je Team (FIFA-Code).
 * Für die Mentalitäts-/Konföderations-Faktoren der λ-Schätzung
 * (Goldman-Sachs-inspiriert): schwerer gegen europäische Teams zu treffen,
 * Boost für etablierte Top-Nationen.
 */

/** UEFA-Mitglieder (Europa) unter den WM-2026-Teilnehmern + üblichen Teams. */
const UEFA = new Set([
  "ESP", "FRA", "ENG", "POR", "NED", "BEL", "GER", "CRO", "ITA", "SUI",
  "DEN", "AUT", "UKR", "SRB", "TUR", "NOR", "SWE", "POL", "SCO", "CZE",
  "BIH", "WAL", "HUN", "SVK", "SVN", "ROU", "GRE", "IRL", "NIR", "ALB",
  "MKD", "GEO", "FIN", "ISL",
]);

/** Etablierte Top-Nationen (WM-Historie / Spitzen-Elo). */
const MAJOR = new Set([
  "BRA", "ARG", "GER", "FRA", "ESP", "ITA", "ENG", "NED", "POR", "URU",
  "BEL", "CRO",
]);

export function isEuropean(teamId: string): boolean {
  return UEFA.has(teamId);
}

export function isMajorNation(teamId: string): boolean {
  return MAJOR.has(teamId);
}

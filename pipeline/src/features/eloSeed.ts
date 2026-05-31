/**
 * Elo-Seed je Team — Näherung aus dem FIFA-Weltranglisten-Punktestand.
 *
 * WARUM: Ohne Seed starten alle Teams bei 1500 (config.elo.initial). Da die
 * geladene Historie nur ~2 Jahre umfasst und Elo nur RELATIV zum Gegner wertet,
 * konnte ein Team mit vielen Siegen gegen (ebenfalls 1500er) schwache Gegner
 * ein fast so hohes Rating erreichen wie eine Top-Nation. Der FIFA-Seed gibt
 * jeder Mannschaft einen realistischen Startwert; die 2-Jahres-Historie justiert
 * von dort aus nach.
 *
 * QUELLE/SKALA: FIFA/Coca-Cola-Weltrangliste (das FIFA-Ranking ist seit 2018
 * selbst Elo-artig). Werte sind auf die Elo-Skala gemappt:
 *   seed ≈ 1500 + (fifaPunkte − 1500) · SCALE
 * gerundete Näherung, Stand ~Anfang 2026. Bewusst grob — die Historie und die
 * KI-Schicht korrigieren weiter. Unbekannte Teams → config.elo.initial.
 *
 * Pflege: Zahlen bei neuer FIFA-Rangliste aktualisieren; Schlüssel = FIFA-Code
 * (canonicalId aus countries.ts).
 */

/** Geschätzte Start-Elo je Team (FIFA-Code → Wert). */
export const ELO_SEED: Record<string, number> = {
  // Spitzengruppe
  ARG: 1885,
  ESP: 1875,
  FRA: 1870,
  ENG: 1825,
  BRA: 1815,
  POR: 1780,
  NED: 1760,
  BEL: 1755,
  GER: 1740,
  CRO: 1710,
  ITA: 1700, // (nicht qualifiziert, zur Vollständigkeit unschädlich)
  MAR: 1700,
  COL: 1690,
  URU: 1680,
  // erweiterte Spitze / starkes Mittelfeld
  USA: 1660,
  MEX: 1655,
  SUI: 1650,
  SEN: 1645,
  JPN: 1640,
  DEN: 1630,
  IRN: 1625,
  KOR: 1620,
  ECU: 1610,
  AUT: 1610,
  UKR: 1600,
  // Mittelfeld
  AUS: 1580,
  CAN: 1575,
  EGY: 1570,
  PAN: 1525,
  NOR: 1565,
  PAR: 1560,
  CIV: 1560,
  TUN: 1555,
  SCO: 1550,
  ALG: 1545,
  NGA: 1545,
  CMR: 1540,
  QAT: 1530,
  SRB: 1600,
  TUR: 1605,
  // unteres Mittelfeld
  CPV: 1490,
  COD: 1520,
  UZB: 1505,
  JOR: 1500,
  IRQ: 1490,
  GHA: 1535,
  RSA: 1500,
  CZE: 1560,
  BIH: 1515,
  // tendenziell schwächere Teilnehmer
  CUW: 1455,
  HAI: 1440,
  NZL: 1450,
  KSA: 1535,
};

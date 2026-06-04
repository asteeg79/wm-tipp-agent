import { describe, it, expect } from "vitest";
import { parseFootballTxt } from "../src/sources/footballTxt.js";

/** Tests des Football.TXT-Parsers (openfootball-Historienformat). */
describe("parseFootballTxt", () => {
  const sample = `= Friendly 2026

# Kommentarzeile wird ignoriert
Sat Jan 18
  Bolivia                1-1 Panama                   @ Tarija, Bolivia
  Grenada                0-1 Jamaica                  @ St. George's, Grenada
Thu Mar 26
  Brazil                 1-2 France                   @ Foxborough, United States
`;

  it("parst Datum, Teams und Tore; bereinigt Venue-Suffix", () => {
    const games = parseFootballTxt(sample, 2026);
    expect(games.length).toBe(3);
    expect(games[0]).toEqual({
      date: "2026-01-18",
      teamA: "Bolivia",
      teamB: "Panama",
      scoreA: 1,
      scoreB: 1,
    });
    expect(games[2]).toMatchObject({
      date: "2026-03-26",
      teamA: "Brazil",
      teamB: "France",
      scoreA: 1,
      scoreB: 2,
    });
  });

  it("ignoriert Kommentar-/Leerzeilen und Zeilen ohne Datumskontext", () => {
    const games = parseFootballTxt("# nur Kommentar\n\n", 2026);
    expect(games).toEqual([]);
  });

  it("verarbeitet Halbzeit-Stände in Klammern", () => {
    const txt = "Sun Mar 15\n  Spain                  2-1 (1-0) Italy   @ Madrid\n";
    const games = parseFootballTxt(txt, 2026);
    expect(games[0]).toMatchObject({ teamA: "Spain", teamB: "Italy", scoreA: 2, scoreB: 1 });
  });
});

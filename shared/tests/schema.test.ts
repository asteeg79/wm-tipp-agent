import { describe, it, expect } from "vitest";
import { Match, PredictionIndexEntry, MarketOdds } from "../src/index.js";

/**
 * Schema-Tests: stellen sicher, dass die zod-Schemas gültige Daten akzeptieren,
 * Defaults setzen und ungültige Daten ablehnen. Pipeline (schreibt) und App
 * (liest) teilen diese Schemas — Brüche hier würden beide Seiten treffen.
 */
describe("shared/zod-Schemas", () => {
  it("Match: setzt predictionHistory-Default und actualResult=null", () => {
    const parsed = Match.parse({
      id: "wc2026-a-b-2026-06-11",
      date: "2026-06-11T19:00:00Z",
      stage: "group",
      homeTeamId: "AAA",
      awayTeamId: "BBB",
      venue: { city: "X", neutral: true },
      status: "scheduled",
    });
    expect(parsed.predictionHistory).toEqual([]);
    expect(parsed.actualResult).toBeNull();
  });

  it("PredictionIndexEntry: akzeptiert optionalen Tipp + Markt-Wahrscheinlichkeiten", () => {
    const e = PredictionIndexEntry.parse({
      matchId: "m1",
      date: "2026-06-11T19:00:00Z",
      stage: "group",
      homeTeamId: "AAA",
      awayTeamId: "BBB",
      predictedScore: { home: 1, away: 0 },
      probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
      confidence: 0.66,
    });
    expect(e.actualResult).toBeNull();
    expect(e.probabilities?.home).toBe(0.5);
  });

  it("MarketOdds: validiert vollständige Buchmacher-Struktur", () => {
    const m = MarketOdds.parse({
      source: "The Odds API",
      updatedAt: "2026-06-03T20:00:00Z",
      bookmakerCount: 21,
      probabilities: { home: 0.67, draw: 0.22, away: 0.11 },
      decimal: { home: 1.43, draw: 4.4, away: 8.5 },
    });
    expect(m.bookmakerCount).toBe(21);
  });

  it("Match: lehnt unbekannte stage ab", () => {
    expect(() =>
      Match.parse({
        id: "x",
        date: "2026-06-11T19:00:00Z",
        stage: "kreisliga",
        homeTeamId: "A",
        awayTeamId: "B",
        venue: { city: "X", neutral: true },
        status: "scheduled",
      }),
    ).toThrow();
  });
});

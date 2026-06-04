import { describe, it, expect } from "vitest";
import {
  expectedScore,
  computeEloRatings,
  type EloGame,
} from "../src/features/elo.js";

/** Tests der World-Football-Elo-Logik. */
describe("expectedScore", () => {
  it("gleiche Ratings → 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });
  it("400 Punkte Vorsprung → ~0.909", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 3);
  });
  it("symmetrisch: E(A,B) + E(B,A) = 1", () => {
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(
      1,
      10,
    );
  });
});

describe("computeEloRatings", () => {
  const game = (
    homeId: string,
    awayId: string,
    gh: number,
    ga: number,
    date: string,
  ): EloGame => ({
    matchId: `${homeId}-${awayId}-${date}`,
    date,
    homeId,
    awayId,
    homeGoals: gh,
    awayGoals: ga,
  });

  it("Sieger gewinnt Rating, Verlierer verliert (Nullsummen-ähnlich)", () => {
    const seed = { A: 1500, B: 1500 };
    const r = computeEloRatings([game("A", "B", 2, 0, "2025-01-01")], seed);
    expect(r.get("A")!).toBeGreaterThan(1500);
    expect(r.get("B")!).toBeLessThan(1500);
  });

  it("höhere Tordifferenz → größere Rating-Änderung", () => {
    const knapp = computeEloRatings([game("A", "B", 1, 0, "2025-01-01")], {
      A: 1500,
      B: 1500,
    });
    const klar = computeEloRatings([game("C", "D", 5, 0, "2025-01-01")], {
      C: 1500,
      D: 1500,
    });
    expect(klar.get("C")! - 1500).toBeGreaterThan(knapp.get("A")! - 1500);
  });

  it("Seed wird als Start-Rating verwendet; Favoriten-Remis kostet Rating", () => {
    // Ohne Spiele werden keine Ratings materialisiert.
    expect(computeEloRatings([], { X: 1820 }).size).toBe(0);
    // Favorit X (1820) spielt 0:0 gegen Y (1500): erwartet > 0.5, Remis = 0.5
    // → X verliert leicht (unter Seed), Y gewinnt.
    const r = computeEloRatings([game("X", "Y", 0, 0, "2025-01-01")], {
      X: 1820,
      Y: 1500,
    });
    expect(r.get("X")!).toBeLessThan(1820);
    expect(r.get("Y")!).toBeGreaterThan(1500);
  });
});

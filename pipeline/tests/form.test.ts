import { describe, it, expect } from "vitest";
import { computeForm, recencyWeight } from "../src/features/form.js";
import type { TeamResult } from "@wm/shared";

/** Baut ein TeamResult mit sinnvollen Defaults. */
function result(date: string, gf: number, ga: number): TeamResult {
  return {
    matchId: `m-${date}`,
    date,
    competition: "Friendly",
    home: true,
    opponentId: "OPP",
    opponentName: "Opponent",
    goalsFor: gf,
    goalsAgainst: ga,
    venue: "home",
    isVsPotentialWcOpponent: false,
  };
}

describe("recencyWeight", () => {
  it("heutiges Spiel hat Gewicht 1", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(recencyWeight("2026-06-01", now)).toBeCloseTo(1, 6);
  });
  it("nach einer Halbwertszeit (180 Tage) Gewicht ~0.5", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const w = recencyWeight("2025-12-03", now); // ~180 Tage davor
    expect(w).toBeGreaterThan(0.45);
    expect(w).toBeLessThan(0.55);
  });
});

describe("computeForm", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("leere Historie → Nullform, Momentum auf Liga-Schnitt", () => {
    const f = computeForm([], now);
    expect(f.matchesCount).toBe(0);
    expect(f.scoredRecent).toBeGreaterThan(0); // Liga-Schnitt-Fallback
    expect(f.daysSinceLastMatch).toBeNull();
  });

  it("nur Siege → hohe gewichtete Form, Clean-Sheet-Rate", () => {
    const f = computeForm(
      [result("2026-05-01", 2, 0), result("2026-05-15", 3, 0)],
      now,
    );
    expect(f.matchesCount).toBe(2);
    expect(f.weightedForm).toBeGreaterThan(2.5); // nahe 3 (Siege)
    expect(f.cleanSheetRate).toBeCloseTo(1, 6);
    expect(f.goalsForAvg).toBeGreaterThan(f.goalsAgainstAvg);
  });

  it("Momentum-Fenster: scoredRecent = Schnitt erzielter Tore", () => {
    const f = computeForm(
      [result("2026-05-01", 1, 1), result("2026-05-20", 3, 1)],
      now,
    );
    expect(f.scoredRecent).toBeCloseTo(2, 6); // (1+3)/2
    expect(f.concededRecent).toBeCloseTo(1, 6);
  });
});

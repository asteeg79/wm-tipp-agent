import { describe, it, expect } from "vitest";
import { runEngine, featureHash } from "../src/features/engine.js";
import type { TeamResult } from "@wm/shared";

/** Tests der Engine-Orchestrierung (Feature-Bundle + Baseline + Hash). */
function res(date: string, oppId: string, gf: number, ga: number): TeamResult {
  return {
    matchId: `m-${date}-${oppId}`,
    date,
    competition: "Friendly",
    home: true,
    opponentId: oppId,
    opponentName: oppId,
    goalsFor: gf,
    goalsAgainst: ga,
    venue: "neutral",
    isVsPotentialWcOpponent: false,
  };
}

const now = new Date("2026-06-01T00:00:00Z");

describe("runEngine", () => {
  it("liefert konsistentes Feature-Bundle + Baseline", () => {
    const out = runEngine(
      { homeTeamId: "GER", awayTeamId: "BBB", neutral: true, altitude: null },
      { teamId: "GER", elo: 1800, results: [res("2026-05-01", "BBB", 2, 0)] },
      { teamId: "BBB", elo: 1500, results: [res("2026-05-01", "GER", 0, 2)] },
      now,
    );
    const p = out.baseline.probabilities;
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 3); // round4 → minimal um 1
    // stärkeres Heimteam (höherer Elo) → Heimsieg wahrscheinlicher.
    expect(p.home).toBeGreaterThan(p.away);
    expect(out.featureBundle.home.teamId).toBe("GER");
    expect(out.baseline.source).toBe("elo+poisson");
  });

  it("rechnet H2H aus den Heim-Ergebnissen gegen den Gegner", () => {
    const out = runEngine(
      { homeTeamId: "AAA", awayTeamId: "ZZZ", neutral: true, altitude: null },
      {
        teamId: "AAA",
        elo: 1600,
        results: [res("2025-09-01", "ZZZ", 3, 1), res("2025-10-01", "ZZZ", 0, 0)],
      },
      { teamId: "ZZZ", elo: 1600, results: [] },
      now,
    );
    expect(out.featureBundle.h2h.played).toBe(2);
    expect(out.featureBundle.h2h.homeWins).toBe(1);
    expect(out.featureBundle.h2h.draws).toBe(1);
  });
});

describe("featureHash", () => {
  it("ist stabil gegenüber generatedAt, ändert sich bei echten Daten", () => {
    const base = runEngine(
      { homeTeamId: "AAA", awayTeamId: "BBB", neutral: true, altitude: null },
      { teamId: "AAA", elo: 1600, results: [res("2026-05-01", "BBB", 1, 0)] },
      { teamId: "BBB", elo: 1550, results: [] },
      now,
    ).featureBundle;
    const later = { ...base, generatedAt: "2099-01-01T00:00:00Z" };
    expect(featureHash(base)).toBe(featureHash(later)); // generatedAt egal
    const changed = { ...base, home: { ...base.home, elo: 1700 } };
    expect(featureHash(changed)).not.toBe(featureHash(base));
  });
});

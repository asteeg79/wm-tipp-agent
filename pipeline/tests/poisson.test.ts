import { describe, it, expect } from "vitest";
import {
  estimateLambdas,
  poissonBaseline,
} from "../src/features/poisson.js";
import type { FormMetrics } from "../src/features/form.js";

/** Neutrale Form (Liga-Schnitt), damit Tests gezielt einzelne Effekte messen. */
function form(overrides: Partial<FormMetrics> = {}): FormMetrics {
  return {
    weightedForm: 1.5,
    recentForm: 1.5,
    goalsForAvg: 1.35,
    goalsAgainstAvg: 1.35,
    cleanSheetRate: 0.3,
    matchesCount: 10,
    daysSinceLastMatch: 5,
    scoredRecent: 1.35,
    concededRecent: 1.35,
    ...overrides,
  };
}

describe("estimateLambdas", () => {
  it("stärkeres Team (positive Elo-Diff) erhält höheres λ", () => {
    const { home, away } = estimateLambdas(200, form(), form(), null);
    expect(home).toBeGreaterThan(away);
  });

  it("Heimvorteil des Gastgebers erhöht Heim-λ", () => {
    const neutral = estimateLambdas(0, form(), form(), null);
    const host = estimateLambdas(0, form(), form(), true);
    expect(host.home).toBeGreaterThan(neutral.home);
  });

  it("Winner's-Slump dämpft λ des Titelverteidigers (ARG)", () => {
    const normal = estimateLambdas(0, form(), form(), null, { homeId: "BRA" });
    const champ = estimateLambdas(0, form(), form(), null, { homeId: "ARG" });
    expect(champ.home).toBeLessThan(normal.home);
  });

  it("λ bleibt in plausiblen Grenzen [0.2, 4.5]", () => {
    const { home, away } = estimateLambdas(2000, form({ goalsForAvg: 9 }), form(), true);
    expect(home).toBeLessThanOrEqual(4.5);
    expect(away).toBeGreaterThanOrEqual(0.2);
  });
});

describe("poissonBaseline", () => {
  it("1X2-Wahrscheinlichkeiten summieren zu 1", () => {
    const b = poissonBaseline(1.5, 1.1);
    const s = b.probabilities.home + b.probabilities.draw + b.probabilities.away;
    expect(s).toBeCloseTo(1, 4);
  });

  it("höheres Heim-λ → Heimsieg wahrscheinlichster Ausgang", () => {
    const b = poissonBaseline(2.2, 0.7);
    expect(b.probabilities.home).toBeGreaterThan(b.probabilities.away);
    expect(b.mostLikelyScore.home).toBeGreaterThan(b.mostLikelyScore.away);
  });

  it("gleiche λ → Heim/Auswärts symmetrisch", () => {
    const b = poissonBaseline(1.2, 1.2);
    expect(b.probabilities.home).toBeCloseTo(b.probabilities.away, 4);
  });

  it("niedrige gleiche λ → Remis dominiert, wahrscheinlichstes Ergebnis 0:0", () => {
    const b = poissonBaseline(0.5, 0.5);
    expect(b.probabilities.draw).toBeGreaterThan(b.probabilities.home);
    expect(b.mostLikelyScore).toEqual({ home: 0, away: 0 });
  });
});

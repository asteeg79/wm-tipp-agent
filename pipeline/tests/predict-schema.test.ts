import { describe, it, expect } from "vitest";
import { normalizeProbs, LlmPrediction } from "../src/predict/schema.js";

/** Tests des LLM-Antwort-Schemas + Wahrscheinlichkeits-Normierung. */
describe("normalizeProbs", () => {
  it("normiert auf Summe 1", () => {
    const p = normalizeProbs({ home: 2, draw: 1, away: 1 });
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10);
    expect(p.home).toBeCloseTo(0.5, 10);
  });

  it("fällt bei Summe 0 auf Gleichverteilung zurück", () => {
    const p = normalizeProbs({ home: 0, draw: 0, away: 0 });
    expect(p.home).toBeCloseTo(1 / 3, 10);
  });
});

describe("LlmPrediction-Schema", () => {
  it("kürzt keyFactors/risks auf erlaubte Maxima", () => {
    const parsed = LlmPrediction.parse({
      predictedScore: { home: 1, away: 0 },
      probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
      confidence: 0.6,
      keyFactors: ["a", "b", "c", "d", "e", "f", "g", "h"],
      risks: ["r1", "r2", "r3", "r4", "r5"],
    });
    expect(parsed.keyFactors.length).toBeLessThanOrEqual(6);
    expect(parsed.risks.length).toBeLessThanOrEqual(4);
  });
});

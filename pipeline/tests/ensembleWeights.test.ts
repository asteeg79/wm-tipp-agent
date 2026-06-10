import { describe, it, expect } from "vitest";
import {
  computeModelComparison,
  computeModelWeights,
  type FinishedWithModels,
} from "../src/predict/ensembleWeights.js";
import type { ModelPrediction, Outcome1x2, ScoreLine } from "@wm/shared";

/** Baut einen Einzelmodell-Tipp mit gegebenen Wahrscheinlichkeiten. */
function mp(probabilities: Outcome1x2): ModelPrediction {
  return {
    predictedScore: { home: 1, away: 0 },
    probabilities,
    confidence: 0.7,
    keyFactors: ["f"],
    risks: ["r"],
  };
}

/** Beendete Partie: Claude tippt `claude`, ChatGPT tippt `chatgpt`. */
function finished(
  actual: ScoreLine,
  claude: Outcome1x2,
  chatgpt: Outcome1x2,
): FinishedWithModels {
  return {
    actualResult: actual,
    models: { claude: mp(claude), chatgpt: mp(chatgpt) },
  };
}

const HOME_WIN: ScoreLine = { home: 2, away: 0 };
const SHARP_HOME: Outcome1x2 = { home: 0.8, draw: 0.15, away: 0.05 };
const WRONG_AWAY: Outcome1x2 = { home: 0.1, draw: 0.2, away: 0.7 };
const NEUTRAL: Outcome1x2 = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

describe("computeModelWeights", () => {
  it("null bei zu kleiner Stichprobe (Mindestanzahl pro Modell)", () => {
    const data = [finished(HOME_WIN, SHARP_HOME, WRONG_AWAY)];
    expect(computeModelWeights(data, 5)).toBeNull();
  });

  it("treffsicheres Modell bekommt mehr Gewicht; Summe 1", () => {
    // Claude liegt 6× richtig, ChatGPT 6× falsch.
    const data = Array.from({ length: 6 }, () =>
      finished(HOME_WIN, SHARP_HOME, WRONG_AWAY),
    );
    const w = computeModelWeights(data, 5)!;
    expect(w).not.toBeNull();
    expect(w.weights.claude).toBeGreaterThan(w.weights.chatgpt);
    expect(w.weights.claude + w.weights.chatgpt).toBeCloseTo(1, 6);
    expect(w.samples).toEqual({ claude: 6, chatgpt: 6 });
    expect(w.rpsMean.claude).toBeLessThan(w.rpsMean.chatgpt);
  });

  it("clampt auf [0.25, 0.75] — kein Modell wird stummgeschaltet", () => {
    // Extremfall: Claude perfekt, ChatGPT maximal daneben.
    const data = Array.from({ length: 10 }, () =>
      finished(
        HOME_WIN,
        { home: 1, draw: 0, away: 0 },
        { home: 0, draw: 0, away: 1 },
      ),
    );
    const w = computeModelWeights(data, 5)!;
    expect(w.weights.claude).toBeLessThanOrEqual(0.75);
    expect(w.weights.chatgpt).toBeGreaterThanOrEqual(0.25);
  });

  it("gleich gute Modelle → nahezu 50/50", () => {
    const data = Array.from({ length: 8 }, () =>
      finished(HOME_WIN, NEUTRAL, NEUTRAL),
    );
    const w = computeModelWeights(data, 5)!;
    expect(w.weights.claude).toBeCloseTo(0.5, 4);
    expect(w.weights.chatgpt).toBeCloseTo(0.5, 4);
  });

  it("Partien ohne Modell-Tipp zählen nicht zur Stichprobe", () => {
    const noChatgpt: FinishedWithModels[] = Array.from({ length: 6 }, () => ({
      actualResult: HOME_WIN,
      models: { claude: mp(SHARP_HOME) },
    }));
    expect(computeModelWeights(noChatgpt, 5)).toBeNull();
  });
});

describe("computeModelComparison", () => {
  it("null ohne beendete Partien", () => {
    expect(computeModelComparison([], 5)).toBeNull();
  });

  it("liefert je Modell eigene Aggregate (auch unter der Gewichts-Mindestmenge)", () => {
    // 2 Partien: Claude trifft Tendenz (Heimsieg), ChatGPT liegt daneben.
    const data = Array.from({ length: 2 }, () =>
      finished(HOME_WIN, SHARP_HOME, WRONG_AWAY),
    );
    const cmp = computeModelComparison(data, 5)!;
    expect(cmp.claude.finishedCount).toBe(2);
    expect(cmp.chatgpt.finishedCount).toBe(2);
    expect(cmp.claude.rpsMean!).toBeLessThan(cmp.chatgpt.rpsMean!);
    // predictedScore der Fixtures ist 1:0 → Tendenz Heimsieg = Treffer.
    expect(cmp.claude.outcomeRate).toBe(1);
    // Unter minSample: keine Gewichte, aber Aggregate vorhanden.
    expect(cmp.weights).toBeUndefined();
  });

  it("ab Mindeststichprobe sind die Gewichte enthalten", () => {
    const data = Array.from({ length: 6 }, () =>
      finished(HOME_WIN, SHARP_HOME, WRONG_AWAY),
    );
    const cmp = computeModelComparison(data, 5)!;
    expect(cmp.weights).toBeDefined();
    expect(cmp.weights!.claude).toBeGreaterThan(cmp.weights!.chatgpt);
  });
});

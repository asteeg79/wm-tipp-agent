import { describe, it, expect } from "vitest";
import {
  makeEnsembleFrom,
  type EvaluateInput,
} from "../src/predict/index.js";
import type { ModelClient } from "../src/predict/models.js";
import type { LlmPrediction } from "../src/predict/schema.js";
import type { Baseline } from "@wm/shared";

/**
 * Tests der Bündel-Bewertung (evaluateMany): Claude liefert via predictMany
 * (Batch-Pfad), ChatGPT via Einzel-Calls — Fehler einzelner Items/Modelle
 * dürfen die übrigen Tipps nicht beeinträchtigen.
 */
const baseline: Baseline = {
  source: "elo+poisson",
  probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
  expectedGoals: { home: 1.4, away: 1.1 },
};

function pred(home: number, conf = 0.7): LlmPrediction {
  return {
    predictedScore: { home: 2, away: 0 },
    probabilities: { home, draw: (1 - home) / 2, away: (1 - home) / 2 },
    confidence: conf,
    keyFactors: ["x"],
    risks: ["y"],
  };
}

function input(i: number): EvaluateInput {
  return {
    homeName: `Heim${i}`,
    awayName: `Gast${i}`,
    featureBundle: {
      generatedAt: "2026-06-10T00:00:00Z",
      home: { teamId: "A", elo: 1800, formSummary: "" },
      away: { teamId: "B", elo: 1600, formSummary: "" },
    } as never,
    baseline,
    homeNews: [],
    awayNews: [],
    inputHash: `h${i}`,
    now: new Date("2026-06-10T12:00:00Z"),
  };
}

/** Fake-Claude: nutzt den Batch-Pfad (predictMany). */
function fakeClaude(
  results: (LlmPrediction | Error)[],
  calls: string[],
): ModelClient {
  return {
    id: "claude",
    available: true,
    predict: () => Promise.reject(new Error("direct nicht erwartet")),
    predictMany: (msgs) => {
      calls.push(`batch:${msgs.length}`);
      return Promise.resolve(results);
    },
  };
}

/** Fake-ChatGPT: nur Einzel-Calls. */
function fakeChatgpt(byIndex: (LlmPrediction | Error)[]): ModelClient {
  let n = 0;
  return {
    id: "chatgpt",
    available: true,
    predict: () => {
      const r = byIndex[n++]!;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
}

describe("Ensemble.evaluateMany", () => {
  it("nutzt predictMany (Batch) und liefert je Eingabe eine Prediction", async () => {
    const calls: string[] = [];
    const ensemble = makeEnsembleFrom([
      fakeClaude([pred(0.7), pred(0.6)], calls),
      fakeChatgpt([pred(0.7), pred(0.6)]),
    ]);
    const out = await ensemble.evaluateMany([input(0), input(1)]);
    expect(out).toHaveLength(2);
    expect(calls).toEqual(["batch:2"]); // genau EIN Batch-Call
    expect(out[0]!.models?.claude).toBeDefined();
    expect(out[0]!.models?.chatgpt).toBeDefined();
  });

  it("Einzelfehler eines Modells: übrige Partie nutzt das andere Modell", async () => {
    const ensemble = makeEnsembleFrom([
      fakeClaude([new Error("kaputt"), pred(0.8)], []),
      fakeChatgpt([pred(0.55), pred(0.8)]),
    ]);
    const out = await ensemble.evaluateMany([input(0), input(1)]);
    // Partie 0: nur ChatGPT; Partie 1: beide.
    expect(out[0]!.models?.claude).toBeUndefined();
    expect(out[0]!.models?.chatgpt).toBeDefined();
    expect(out[1]!.models?.claude).toBeDefined();
  });

  it("Totalausfall beider Modelle → Baseline-Fallback statt Wurf", async () => {
    const ensemble = makeEnsembleFrom([
      fakeClaude([new Error("a")], []),
      fakeChatgpt([new Error("b")]),
    ]);
    const out = await ensemble.evaluateMany([input(0)]);
    expect(out[0]!.probabilities).toEqual(baseline.probabilities);
    expect(out[0]!.models).toBeUndefined();
  });
});

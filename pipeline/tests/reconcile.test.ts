import { describe, it, expect } from "vitest";
import { reconcile, type ModelResult } from "../src/predict/reconcile.js";
import type { Baseline } from "@wm/shared";

/**
 * Tests der Reconciliation (predict/reconcile.ts) — der korrektheitskritischen
 * Zusammenführung beider KI-Modelle zum finalen Tipp. Enthält den
 * REGRESSIONSTEST für den Haiti–Schottland-Bug (Modell-Konsens wurde von einem
 * Mikro-Wahrscheinlichkeitsvorsprung gekippt → falscher 2:1).
 */
const baseline: Baseline = {
  source: "elo+poisson",
  probabilities: { home: 0.39, draw: 0.26, away: 0.35 },
  expectedGoals: { home: 1.38, away: 1.28 },
};

function model(
  id: "claude" | "chatgpt",
  h: number,
  a: number,
  ph: number,
  pd: number,
  pa: number,
  conf: number,
): ModelResult {
  return {
    id,
    prediction: {
      predictedScore: { home: h, away: a },
      probabilities: { home: ph, draw: pd, away: pa },
      confidence: conf,
      keyFactors: [],
      risks: [],
    },
  };
}

describe("reconcile", () => {
  it("REGRESSION Haiti–Schottland: Konsens 1:1 schlägt Mikro-Vorsprung", () => {
    const r = reconcile(
      [
        model("claude", 1, 1, 0.37, 0.27, 0.36, 0.42),
        model("chatgpt", 1, 1, 0.35, 0.3, 0.35, 0.72),
      ],
      baseline,
      new Date(),
      "h",
    );
    // Beide Modelle 1:1, Probs fast Gleichstand → finaler Score MUSS 1:1 sein.
    expect(r.predictedScore).toEqual({ home: 1, away: 1 });
  });

  it("klarer Heimfavorit: Heimsieg bleibt erhalten", () => {
    const r = reconcile(
      [
        model("claude", 2, 0, 0.62, 0.22, 0.16, 0.6),
        model("chatgpt", 2, 1, 0.68, 0.18, 0.14, 0.7),
      ],
      { ...baseline, expectedGoals: { home: 1.9, away: 0.8 } },
      new Date(),
      "h",
    );
    expect(r.predictedScore.home).toBeGreaterThan(r.predictedScore.away);
  });

  it("Konsens-Override nur bei klarem Favoriten (margin ≥ 0.10)", () => {
    const r = reconcile(
      [
        model("claude", 1, 1, 0.5, 0.25, 0.25, 0.5),
        model("chatgpt", 1, 1, 0.5, 0.25, 0.25, 0.6),
      ],
      { ...baseline, expectedGoals: { home: 1.8, away: 0.9 } },
      new Date(),
      "h",
    );
    // Klarer Heimvorteil (margin 0.25) → 1:1-Konsens darf überstimmt werden.
    expect(r.predictedScore.home).toBeGreaterThan(r.predictedScore.away);
  });

  it("konfidenzgewichtete Wahrscheinlichkeiten summieren zu 1", () => {
    const r = reconcile(
      [
        model("claude", 1, 0, 0.5, 0.3, 0.2, 0.4),
        model("chatgpt", 2, 1, 0.6, 0.25, 0.15, 0.8),
      ],
      baseline,
      new Date(),
      "h",
    );
    const sum =
      r.probabilities.home + r.probabilities.draw + r.probabilities.away;
    // Werte sind auf 4 Nachkommastellen gerundet → Summe minimal um 1.
    expect(sum).toBeCloseTo(1, 3);
    // ChatGPT (conf 0.8) zieht die Mischung stärker → home > away.
    expect(r.probabilities.home).toBeGreaterThan(r.probabilities.away);
  });

  it("ohne Modelle: Baseline-Fallback", () => {
    const r = reconcile([], baseline, new Date(), "h");
    expect(r.probabilities).toEqual(baseline.probabilities);
    expect(r.models).toBeUndefined();
  });

  it("agreement sinkt bei Uneinigkeit und dämpft die Konfidenz", () => {
    const einig = reconcile(
      [
        model("claude", 1, 0, 0.6, 0.25, 0.15, 0.7),
        model("chatgpt", 1, 0, 0.6, 0.25, 0.15, 0.7),
      ],
      baseline,
      new Date(),
      "h",
    );
    const uneinig = reconcile(
      [
        model("claude", 2, 0, 0.7, 0.2, 0.1, 0.7),
        model("chatgpt", 0, 2, 0.1, 0.2, 0.7, 0.7),
      ],
      baseline,
      new Date(),
      "h",
    );
    expect(einig.agreement!).toBeGreaterThan(uneinig.agreement!);
    expect(uneinig.confidence).toBeLessThan(einig.confidence);
  });
});

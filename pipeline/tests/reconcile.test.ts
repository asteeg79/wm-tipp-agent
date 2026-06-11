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

  it("REGRESSION Brasilien–Marokko: knappes Rennen überstimmt KEINEN Modell-Tipp", () => {
    // Echte Daten vom 13.06.: Claude 1:2 (Marokko), ChatGPT 1:1 (Remis) mit
    // höherer Konfidenz. Gemischt führte "Heimsieg" mit nur 37,7 % zu 31,9 %
    // (margin 0.058) — die Konsistenz-Regel erzwang per xG ein 3:2 für
    // Brasilien, das KEIN Modell getippt hatte. Erwartet: Score des
    // konfidenzstärkeren Modells (1:1) bleibt unangetastet.
    const r = reconcile(
      [
        model("claude", 1, 2, 0.34, 0.27, 0.39, 0.48),
        model("chatgpt", 1, 1, 0.4, 0.35, 0.25, 0.75),
      ],
      {
        ...baseline,
        probabilities: { home: 0.2597, draw: 0.2597, away: 0.4806 },
        expectedGoals: { home: 1.03, away: 1.5 },
      },
      new Date(),
      "h",
    );
    expect(r.predictedScore).toEqual({ home: 1, away: 1 });
  });

  it("klarer Top-Ausgang (margin ≥ 0.10) erzwingt weiterhin Konsistenz", () => {
    // Stärkeres Modell tippt 1:1, aber BEIDE sehen klar Heimsieg →
    // Konsistenz-Regel darf den Remis-Tipp zum Heimsieg korrigieren.
    const r = reconcile(
      [
        model("claude", 1, 1, 0.62, 0.22, 0.16, 0.8),
        model("chatgpt", 2, 0, 0.68, 0.18, 0.14, 0.6),
      ],
      { ...baseline, expectedGoals: { home: 1.9, away: 0.8 } },
      new Date(),
      "h",
    );
    expect(r.predictedScore.home).toBeGreaterThan(r.predictedScore.away);
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

  it("Accuracy-Gewichte ziehen die Mischung zum treffsichereren Modell", () => {
    const claudeStark = {
      weights: { claude: 0.75, chatgpt: 0.25 },
      rpsMean: { claude: 0.05, chatgpt: 0.3 },
      samples: { claude: 10, chatgpt: 10 },
    };
    // Gleiche Konfidenz, gegensätzliche Tipps → ohne Gewichte symmetrisch.
    const results = [
      model("claude", 2, 0, 0.7, 0.2, 0.1, 0.6),
      model("chatgpt", 0, 2, 0.1, 0.2, 0.7, 0.6),
    ];
    const neutral = reconcile(results, baseline, new Date(), "h");
    const gewichtet = reconcile(
      results,
      baseline,
      new Date(),
      "h",
      claudeStark,
    );
    expect(neutral.probabilities.home).toBeCloseTo(
      neutral.probabilities.away,
      4,
    );
    // Claude (home-lastig) dominiert die gewichtete Mischung.
    expect(gewichtet.probabilities.home).toBeGreaterThan(
      gewichtet.probabilities.away,
    );
    expect(gewichtet.ensembleWeights).toEqual({ claude: 0.75, chatgpt: 0.25 });
    expect(gewichtet.rationale).toContain("Treffsicherheit");
    expect(neutral.ensembleWeights).toBeUndefined();
  });

  it("Accuracy-Gewichte greifen NICHT bei nur einem Modell", () => {
    const r = reconcile(
      [model("claude", 2, 0, 0.7, 0.2, 0.1, 0.6)],
      baseline,
      new Date(),
      "h",
      {
        weights: { claude: 0.75, chatgpt: 0.25 },
        rpsMean: { claude: 0.05, chatgpt: 0.3 },
        samples: { claude: 10, chatgpt: 10 },
      },
    );
    expect(r.ensembleWeights).toBeUndefined();
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

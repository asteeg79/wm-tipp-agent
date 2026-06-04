import { describe, it, expect } from "vitest";
import { scoreMatch, aggregateAccuracy } from "../src/features/accuracy.js";

/** Tests der Genauigkeits-Metriken (exact/outcome/Brier/RPS + Aggregat). */
describe("scoreMatch", () => {
  it("exakter Treffer setzt beide Hits + niedrigen Brier/RPS", () => {
    const a = scoreMatch(
      { home: 2, away: 1 },
      { home: 0.7, draw: 0.2, away: 0.1 },
      { home: 2, away: 1 },
    );
    expect(a.exactScoreHit).toBe(true);
    expect(a.outcomeHit).toBe(true);
    expect(a.brier!).toBeLessThan(0.3);
    expect(a.rps!).toBeLessThan(0.1);
  });

  it("richtige Tendenz, falsches Ergebnis → outcomeHit, kein exact", () => {
    const a = scoreMatch(
      { home: 2, away: 0 },
      { home: 0.6, draw: 0.25, away: 0.15 },
      { home: 1, away: 0 },
    );
    expect(a.exactScoreHit).toBe(false);
    expect(a.outcomeHit).toBe(true);
  });

  it("falsche Tendenz → hoher RPS", () => {
    const richtig = scoreMatch(
      { home: 2, away: 0 },
      { home: 0.7, draw: 0.2, away: 0.1 },
      { home: 2, away: 0 },
    );
    const falsch = scoreMatch(
      { home: 2, away: 0 },
      { home: 0.7, draw: 0.2, away: 0.1 },
      { home: 0, away: 2 },
    );
    expect(falsch.rps!).toBeGreaterThan(richtig.rps!);
  });

  it("ohne Wahrscheinlichkeiten → Brier/RPS null", () => {
    const a = scoreMatch({ home: 1, away: 1 }, undefined, { home: 1, away: 1 });
    expect(a.brier).toBeNull();
    expect(a.rps).toBeNull();
  });
});

describe("aggregateAccuracy", () => {
  it("leere Liste → finishedCount 0, Raten null", () => {
    const agg = aggregateAccuracy([]);
    expect(agg.finishedCount).toBe(0);
    expect(agg.outcomeRate).toBeNull();
  });

  it("aggregiert Trefferquoten + Mittelwerte über beendete Partien", () => {
    const agg = aggregateAccuracy([
      {
        actualResult: { home: 2, away: 1 },
        accuracy: scoreMatch(
          { home: 2, away: 1 },
          { home: 0.7, draw: 0.2, away: 0.1 },
          { home: 2, away: 1 },
        ),
      },
      {
        actualResult: { home: 0, away: 0 },
        accuracy: scoreMatch(
          { home: 1, away: 0 },
          { home: 0.5, draw: 0.3, away: 0.2 },
          { home: 0, away: 0 },
        ),
      },
      { actualResult: null }, // offen → ignoriert
    ]);
    expect(agg.finishedCount).toBe(2);
    expect(agg.exactScoreRate).toBeCloseTo(0.5, 6); // 1 von 2 exakt
    expect(agg.outcomeRate).toBeCloseTo(0.5, 6); // 1 Tendenz (2:1), 1 daneben
    expect(agg.rpsMean!).toBeGreaterThan(0);
  });
});

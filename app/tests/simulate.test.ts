import { describe, it, expect } from "vitest";
import {
  simulateTournament,
  simulateBracket,
  eloWinProb,
  seedSlots,
} from "../src/lib/simulate.js";
import type { IndexFile, PredictionsIndex } from "@wm/shared";

/**
 * Tests der Turnier-Simulation: Elo-Wahrscheinlichkeit, Setzliste sowie das
 * End-to-End-Verhalten (echte Ergebnisse, Tor-Sim, 2026-Feld, Elo-K.o.).
 */
describe("eloWinProb", () => {
  it("gleiche Elo → 0.5", () => {
    expect(eloWinProb(1500, 1500)).toBeCloseTo(0.5, 10);
  });
  it("+400 Elo → ~0.909", () => {
    expect(eloWinProb(1900, 1500)).toBeCloseTo(10 / 11, 3);
  });
});

describe("seedSlots", () => {
  it("4er-Bracket: 1 trifft 4, 2 trifft 3 (Hälften getrennt)", () => {
    expect(seedSlots(4)).toEqual([1, 4, 2, 3]);
  });
  it("8er-Bracket: Top-Seeds in verschiedenen Hälften", () => {
    expect(seedSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

/** Baut Index + Prognose für 2 Gruppen à 4 Teams. */
function fixture(): { index: IndexFile; pred: PredictionsIndex } {
  const groups = ["A", "B"];
  const teams = groups.flatMap((g, gi) =>
    [0, 1, 2, 3].map((i) => ({
      id: `${g}${i}`,
      name: `${g}${i}`,
      code: `${g}${i}`,
      groupId: g,
      elo: 1800 - (gi * 4 + i) * 50, // A0 stärkstes, fallend
    })),
  );
  // Round-Robin je Gruppe (6 Spiele), neutrale 1X2 + xG.
  const entries: PredictionsIndex["entries"] = [];
  for (const g of groups) {
    const ids = [0, 1, 2, 3].map((i) => `${g}${i}`);
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++)
        entries.push({
          matchId: `${ids[a]}-${ids[b]}`,
          date: "2026-06-12T00:00:00Z",
          stage: "group",
          homeTeamId: ids[a]!,
          awayTeamId: ids[b]!,
          probabilities: { home: 0.4, draw: 0.3, away: 0.3 },
          expectedGoals: { home: 1.3, away: 1.1 },
          actualResult: null,
        });
  }
  return {
    index: {
      tournament: { name: "T", startDate: "2026-06-11", endDate: "2026-07-19" },
      lastUpdated: "2026-06-09T00:00:00Z",
      groups: groups.map((g) => ({
        id: g,
        teamIds: [0, 1, 2, 3].map((i) => `${g}${i}`),
      })),
      teams,
    } as unknown as IndexFile,
    pred: {
      lastUpdated: "2026-06-09T00:00:00Z",
      aggregate: {
        finishedCount: 0,
        exactScoreRate: null,
        outcomeRate: null,
        brierMean: null,
        rpsMean: null,
      },
      entries,
    } as unknown as PredictionsIndex,
  };
}

describe("simulateTournament", () => {
  it("Wahrscheinlichkeiten sind plausibel (Titel summiert ~1)", () => {
    const { index, pred } = fixture();
    const r = simulateTournament(index, pred, 3000);
    const titleSum = [...r.title.values()].reduce((s, x) => s + x, 0);
    expect(titleSum).toBeGreaterThan(0.95);
    expect(titleSum).toBeLessThanOrEqual(1.0001);
    // Jede advance/groupWinner-Rate in [0,1].
    for (const v of r.advance.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("stärkstes Team (höchstes Elo) hat höchste Titelchance", () => {
    const { index, pred } = fixture();
    const r = simulateTournament(index, pred, 3000);
    const sorted = [...r.title.entries()].sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("A0"); // A0 = höchstes Elo
  });

  it("echtes Ergebnis wird berücksichtigt (3 Siege → sicherer Gruppensieg)", () => {
    const { index, pred } = fixture();
    // A1 gewinnt alle drei Gruppenspiele real 2:0.
    for (const e of pred.entries) {
      if (e.homeTeamId === "A1") e.actualResult = { home: 2, away: 0 };
      else if (e.awayTeamId === "A1") e.actualResult = { home: 0, away: 2 };
    }
    const r = simulateTournament(index, pred, 2000);
    expect(r.groupWinner.get("A1")!).toBeGreaterThan(0.95);
  });
});

describe("simulateBracket", () => {
  it("liefert deterministisch denselben Champion + Runden", () => {
    const { index, pred } = fixture();
    const b1 = simulateBracket(index, pred);
    const b2 = simulateBracket(index, pred);
    expect(b1.champion).toBe(b2.champion);
    expect(b1.rounds.length).toBeGreaterThanOrEqual(1);
    // Jede Partie hat einen Sieger, der eines der beiden Teams ist.
    for (const rnd of b1.rounds)
      for (const m of rnd.matches) expect([m.a, m.b]).toContain(m.winner);
  });

  it("echte K.-o.-Ergebnisse fließen ein, sobald sie existieren", () => {
    const { index, pred } = fixture();
    // Halbfinal-Paarungen mit aufgelösten Teams; ein echtes Ergebnis (Außenseiter
    // B1 schlägt das stärkste Team A0), das andere offen.
    pred.entries.push(
      {
        matchId: "sf1",
        date: "2026-07-14T00:00:00Z",
        stage: "semi",
        homeTeamId: "A0",
        awayTeamId: "B1",
        probabilities: { home: 0.6, draw: 0.2, away: 0.2 },
        actualResult: { home: 0, away: 1 }, // B1 gewinnt real
      },
      {
        matchId: "sf2",
        date: "2026-07-14T03:00:00Z",
        stage: "semi",
        homeTeamId: "A1",
        awayTeamId: "B0",
        probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
        actualResult: null, // offen → simuliert
      },
    );
    const b = simulateBracket(index, pred);
    expect(b.rounds[0]!.stage).toBe("semi");
    const sf = b.rounds[0]!.matches.find((m) => m.a === "A0" && m.b === "B1")!;
    expect(sf.winner).toBe("B1"); // echtes Ergebnis schlägt Elo-Favorit
    expect(sf.score).toEqual({ a: 0, b: 1 });
    // B1 darf trotz schwächerer Elo im Finale stehen → Champion nicht zwingend A0.
    expect(["A0", "A1", "B0", "B1"]).toContain(b.champion);
  });
});

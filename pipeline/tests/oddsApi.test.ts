import { describe, it, expect } from "vitest";
import {
  oddsKey,
  swapMarket,
  deriveMarket,
  type OddsEvent,
} from "../src/sources/oddsApi.js";
import type { MarketOdds } from "@wm/shared";

/** Tests des Odds-Service: Namens-Normierung, De-vig-Mathematik, Heim/Auswärts-Tausch. */
describe("oddsKey", () => {
  it("normalisiert Diakritika und Sonderzeichen", () => {
    expect(oddsKey("Curaçao", "Côte d'Ivoire")).toBe(
      oddsKey("Curacao", "Cote d Ivoire"),
    );
    expect(oddsKey("Bosnia & Herzegovina", "X")).toBe("bosniaherzegovina|x");
  });
});

describe("deriveMarket (de-vig)", () => {
  const ev: OddsEvent = {
    home_team: "Mexico",
    away_team: "South Africa",
    commence_time: "2026-06-11T19:00:00Z",
    bookmakers: [
      {
        key: "bk1",
        title: "BK1",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Mexico", price: 1.4 },
              { name: "South Africa", price: 9.0 },
              { name: "Draw", price: 4.5 },
            ],
          },
        ],
      },
      {
        key: "bk2",
        title: "BK2",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Mexico", price: 1.5 },
              { name: "South Africa", price: 8.0 },
              { name: "Draw", price: 4.0 },
            ],
          },
        ],
      },
    ],
  };

  it("liefert normierte 1X2 (Σ=1) ohne Buchmacher-Marge", () => {
    const m = deriveMarket(ev)!;
    const sum =
      m.probabilities.home + m.probabilities.draw + m.probabilities.away;
    expect(sum).toBeCloseTo(1, 6);
    expect(m.bookmakerCount).toBe(2);
    expect(m.probabilities.home).toBeGreaterThan(m.probabilities.away);
  });

  it("nutzt den Median der Dezimalquoten", () => {
    const m = deriveMarket(ev)!;
    // Median aus [1.4, 1.5] = 1.45
    expect(m.decimal.home).toBeCloseTo(1.45, 2);
  });

  it("ohne h2h-Markt → null", () => {
    const empty: OddsEvent = { ...ev, bookmakers: [] };
    expect(deriveMarket(empty)).toBeNull();
  });
});

describe("swapMarket", () => {
  it("tauscht Heim/Auswärts in Wahrscheinlichkeiten und Quoten", () => {
    const m: MarketOdds = {
      source: "x",
      updatedAt: "2026-06-03T00:00:00Z",
      bookmakerCount: 5,
      probabilities: { home: 0.6, draw: 0.25, away: 0.15 },
      decimal: { home: 1.5, draw: 4, away: 7 },
    };
    const s = swapMarket(m);
    expect(s.probabilities).toEqual({ home: 0.15, draw: 0.25, away: 0.6 });
    expect(s.decimal).toEqual({ home: 7, draw: 4, away: 1.5 });
  });
});

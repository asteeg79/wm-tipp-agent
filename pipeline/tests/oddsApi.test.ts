import { describe, it, expect } from "vitest";
import {
  oddsKey,
  swapMarket,
  deriveMarket,
  effectiveOddsTtlHours,
  isPlausibleMarket,
  type OddsEvent,
} from "../src/sources/oddsApi.js";
import { config } from "../config.js";
import type { MarketOdds } from "@wm/shared";

/** Anpfiffabhängige Cache-TTL: nahe am Anpfiff kürzer, sonst Standard. */
describe("effectiveOddsTtlHours", () => {
  const { ttlHours, nearTtlHours, nearKickoffHours } = config.odds;
  it("kein Spiel anstehend → Standard-TTL", () => {
    expect(effectiveOddsTtlHours(null)).toBe(ttlHours);
  });
  it("nächster Anpfiff weit weg → Standard-TTL", () => {
    expect(effectiveOddsTtlHours(nearKickoffHours + 1)).toBe(ttlHours);
  });
  it("nächster Anpfiff im Fenster → kurze TTL", () => {
    expect(effectiveOddsTtlHours(nearKickoffHours - 0.5)).toBe(nearTtlHours);
    expect(effectiveOddsTtlHours(0.5)).toBe(nearTtlHours);
  });
  it("negative Stunden (Anpfiff vorbei) → Standard-TTL", () => {
    expect(effectiveOddsTtlHours(-3)).toBe(ttlHours);
  });
});

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

  it("verwirft unplausible In-Play-Linie (Remis als Favorit) → null", () => {
    // Spätes 0:0: Remis 1.09 (Favorit), Sieg 8 / 43.5 — wie Spanien–Kap Verde.
    const inplay: OddsEvent = {
      home_team: "Spain",
      away_team: "Cape Verde",
      commence_time: "2026-06-15T16:00:00Z",
      bookmakers: [
        {
          key: "bk1",
          title: "BK1",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Spain", price: 8 },
                { name: "Cape Verde", price: 43.5 },
                { name: "Draw", price: 1.09 },
              ],
            },
          ],
        },
      ],
    };
    expect(deriveMarket(inplay)).toBeNull();
  });
});

describe("isPlausibleMarket", () => {
  it("normaler Markt (Favorit + ~25% Remis) → plausibel", () => {
    expect(isPlausibleMarket({ home: 0.6, draw: 0.25, away: 0.15 })).toBe(true);
  });
  it("Remis > 50% → unplausibel (In-Play/Fehl-Linie)", () => {
    expect(isPlausibleMarket({ home: 0.12, draw: 0.86, away: 0.02 })).toBe(
      false,
    );
  });
  it("Remis knapp Favorit, aber ≤ 50% → noch plausibel (konservativ)", () => {
    expect(isPlausibleMarket({ home: 0.3, draw: 0.4, away: 0.3 })).toBe(true);
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

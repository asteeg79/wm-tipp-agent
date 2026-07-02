import { describe, it, expect } from "vitest";
import { matchToFixture, type OfMatch } from "../src/sources/openFootball.js";

/**
 * Ist-Ergebnis = NACH VERLÄNGERUNG (`et` falls gespielt, sonst `ft` = 90′);
 * der Elfmeterstand `p` fließt NIE ein — ein per Elfmeter entschiedenes Spiel
 * bleibt ein V-Remis. Der `afterExtraTime`-Marker zeigt "n.V." nur, wenn `et`
 * vorlag.
 */
describe("matchToFixture — V-Ergebnis (nach Verlängerung, nie Elfmeter)", () => {
  const base: OfMatch = {
    round: "Round of 16",
    date: "2026-07-05",
    team1: "Germany",
    team2: "Brazil",
  };

  it("Gruppenspiel: nutzt ft, kein n.V.-Marker", () => {
    const fx = matchToFixture(
      { ...base, round: "Matchday 1", group: "Group A", score: { ft: [2, 1] } },
      "WC",
    );
    expect(fx.goalsHome).toBe(2);
    expect(fx.goalsAway).toBe(1);
    expect(fx.finished).toBe(true);
    expect(fx.afterExtraTime).toBeUndefined();
  });

  it("K.-o. in der Verlängerung entschieden: nutzt et + Marker", () => {
    const fx = matchToFixture(
      { ...base, score: { ft: [1, 1], et: [2, 1] } },
      "WC",
    );
    expect(fx.goalsHome).toBe(2);
    expect(fx.goalsAway).toBe(1);
    expect(fx.afterExtraTime).toBe(true);
  });

  it("K.-o. im Elfmeterschießen: bleibt V-Remis, p wird ignoriert", () => {
    const fx = matchToFixture(
      { ...base, score: { ft: [1, 1], et: [1, 1], p: [4, 2] } },
      "WC",
    );
    // V-Remis 1:1 — der Elfmetersieg (4:2) taucht NICHT im Ergebnis auf.
    expect(fx.goalsHome).toBe(1);
    expect(fx.goalsAway).toBe(1);
    expect(fx.afterExtraTime).toBe(true);
  });

  it("noch nicht gespielt: kein Ergebnis, nicht finished", () => {
    const fx = matchToFixture(base, "WC");
    expect(fx.goalsHome).toBeNull();
    expect(fx.goalsAway).toBeNull();
    expect(fx.finished).toBe(false);
    expect(fx.afterExtraTime).toBeUndefined();
  });
});

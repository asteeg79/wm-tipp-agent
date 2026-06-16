import { describe, it, expect } from "vitest";
import { decideRetrigger } from "../src/predict/retrigger.js";
import type { Match, NewsItem } from "@wm/shared";

/**
 * Tests der Re-Trigger-Logik (Kosten-Kontrolle). Kernfall: eine materielle
 * News löst nur dann eine Neubewertung aus, wenn sie NEUER ist als der letzte
 * Tipp — sonst würde dieselbe Schlagzeile bei jedem Lauf teuer re-evaluieren
 * (früherer Kostentreiber: ein Spiel wurde 46× neu bewertet).
 */
const KICKOFF = "2026-06-20T18:00:00Z";

/** Minimaler Match mit KI-Tipp, der zu `genAt` erzeugt wurde. */
function matchWithTip(genAt: string, inputHash = "h1"): Match {
  return {
    id: "m1",
    date: KICKOFF,
    stage: "group",
    homeTeamId: "A",
    awayTeamId: "B",
    venue: { city: "X", neutral: true },
    status: "scheduled",
    actualResult: null,
    predictionHistory: [],
    prediction: {
      generatedAt: genAt,
      predictedScore: { home: 1, away: 0 },
      probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
      confidence: 0.6,
      inputHash,
      models: {
        claude: {
          predictedScore: { home: 1, away: 0 },
          probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
          confidence: 0.6,
          keyFactors: ["x"],
          risks: ["y"],
        },
      },
    },
  } as Match;
}

function news(publishedAt: string, impactTag: NewsItem["impactTag"]): NewsItem {
  return {
    title: "t",
    source: "s",
    url: "https://example.com/n",
    publishedAt,
    snippet: "",
    impactTag,
  };
}

const NOW = new Date("2026-06-19T12:00:00Z"); // T-30h

describe("decideRetrigger — News-Aktualität", () => {
  it("ALTE materielle News (vor letztem Tipp) → KEINE Neubewertung", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z");
    const alt = [news("2026-06-18T08:00:00Z", "injury")];
    const d = decideRetrigger(match, "h1", alt, [], NOW);
    expect(d.shouldEvaluate).toBe(false);
  });

  it("NEUE materielle News (nach letztem Tipp) → Neubewertung", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z");
    const neu = [news("2026-06-19T11:30:00Z", "suspension")];
    const d = decideRetrigger(match, "h1", neu, [], NOW);
    expect(d.shouldEvaluate).toBe(true);
    expect(d.reason).toContain("News");
  });

  it("neue, aber NICHT materielle News (impactTag none) → keine Neubewertung", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z");
    const neu = [news("2026-06-19T11:30:00Z", "none")];
    const d = decideRetrigger(match, "h1", neu, [], NOW);
    expect(d.shouldEvaluate).toBe(false);
  });

  it("geänderter inputHash → Neubewertung (echte Datenänderung)", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z", "h1");
    const d = decideRetrigger(match, "h2", [], [], NOW);
    expect(d.shouldEvaluate).toBe(true);
    expect(d.reason).toContain("Feature");
  });

  it("noch kein KI-Tipp → Neubewertung", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z");
    delete (match.prediction as { models?: unknown }).models;
    const d = decideRetrigger(match, "h1", [], [], NOW);
    expect(d.shouldEvaluate).toBe(true);
  });

  it("beendetes Spiel → nie", () => {
    const match = matchWithTip("2026-06-19T10:00:00Z");
    match.status = "finished";
    const neu = [news("2026-06-19T11:30:00Z", "injury")];
    const d = decideRetrigger(match, "h9", neu, [], NOW);
    expect(d.shouldEvaluate).toBe(false);
  });
});

describe("decideRetrigger — Zeit-Milestones [24, 12, 4]", () => {
  it("T-24h-Milestone wird fällig, wenn letzter Tipp davor lag", () => {
    // Letzter Tipp bei T-40h, jetzt T-23h → 24h-Milestone überschritten.
    const match = matchWithTip("2026-06-19T02:00:00Z");
    const d = decideRetrigger(
      match,
      "h1",
      [],
      [],
      new Date("2026-06-19T19:00:00Z"),
    );
    expect(d.shouldEvaluate).toBe(true);
    expect(d.reason).toContain("T-24h");
  });

  it("T-12h-Milestone deckt Nacht-/Frühspiele am Abend ab (vor der Cron-Pause)", () => {
    // Anpfiff KICKOFF (T0). Letzter Tipp lag bei T-24h; beim Abendlauf ~T-11h
    // (vor der Nachtpause) MUSS der quasi finale Tipp fallen, weil das
    // T-4h-Update sonst mitten in die pausierten Nachtstunden fiele.
    const match = matchWithTip("2026-06-19T18:00:00Z"); // Tipp = T-24h
    const abendlauf = new Date("2026-06-20T07:00:00Z"); // T-11h
    const d = decideRetrigger(match, "h1", [], [], abendlauf);
    expect(d.shouldEvaluate).toBe(true);
    expect(d.reason).toContain("T-12h");
  });

  it("kein Milestone offen (Tipp lag bereits unter 12h, 4h fern) → keine Neubewertung", () => {
    // Letzter Tipp bei T-10h, jetzt T-8h → 24h und 12h abgehakt, 4h noch fern.
    const match = matchWithTip("2026-06-20T08:00:00Z"); // Tipp = T-10h
    const d = decideRetrigger(
      match,
      "h1",
      [],
      [],
      new Date("2026-06-20T10:00:00Z"), // T-8h
    );
    expect(d.shouldEvaluate).toBe(false);
  });
});

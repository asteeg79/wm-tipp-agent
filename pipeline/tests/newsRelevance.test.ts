import { describe, it, expect } from "vitest";
import { parseRelevantIndices } from "../src/predict/newsRelevance.js";
import { matchesTeam } from "../src/features/news.js";
import type { RawNewsItem } from "../src/sources/rss.js";

/** Tests des News-Relevanzfilters (Index-Parsing) + wortgenauen Matchings. */
describe("parseRelevantIndices", () => {
  it("liest ein JSON-Array aus der Antwort", () => {
    expect(parseRelevantIndices("[0,2,5]", 6)).toEqual([0, 2, 5]);
  });
  it("findet das Array auch in umgebendem Text", () => {
    expect(parseRelevantIndices("Relevant: [1, 3] — fertig.", 4)).toEqual([
      1, 3,
    ]);
  });
  it("ignoriert Out-of-Range- und Nicht-Integer-Werte", () => {
    expect(parseRelevantIndices('[0, 9, "2", -1, 1.5]', 5)).toEqual([0, 2]);
  });
  it("ohne Array → leeres Ergebnis", () => {
    expect(parseRelevantIndices("nichts relevant", 5)).toEqual([]);
  });
  it("entfernt Duplikate und sortiert", () => {
    expect(parseRelevantIndices("[3,1,3,1]", 5)).toEqual([1, 3]);
  });
});

describe("matchesTeam (wortgenau)", () => {
  const item = (title: string): RawNewsItem => ({
    title,
    source: "x",
    url: "https://x/" + encodeURIComponent(title),
    publishedAt: "2026-06-01T00:00:00Z",
    snippet: "",
  });

  it("matcht den vollständigen Teamnamen als ganzes Wort", () => {
    expect(matchesTeam(item("France beat Spain in friendly"), "France")).toBe(
      true,
    );
  });
  it("matcht NICHT als bloßen Substring (Mali ≠ Somalia)", () => {
    // Altes includes()-Matching hätte hier fälschlich getroffen.
    expect(matchesTeam(item("Somalia floods displace thousands"), "Mali")).toBe(
      false,
    );
  });
  it("ignoriert Diakritika", () => {
    expect(matchesTeam(item("Curacao gewinnt"), "Curaçao")).toBe(true);
  });
  it("matcht mehrteilige Namen", () => {
    expect(matchesTeam(item("South Korea names squad"), "South Korea")).toBe(
      true,
    );
  });
});

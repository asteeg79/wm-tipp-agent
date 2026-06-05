import { describe, it, expect } from "vitest";
import { compareNews } from "../src/features/news.js";

/** Tests der News-Sortierung: deutschsprachig bevorzugt, dann Aktualität. */
describe("compareNews", () => {
  it("deutschsprachige News stehen vor englischen", () => {
    const de = { lang: "de" as const, publishedAt: "2026-06-01T00:00:00Z" };
    const en = { lang: "en" as const, publishedAt: "2026-06-10T00:00:00Z" };
    // DE vor EN, auch wenn die EN-Meldung neuer ist.
    expect(compareNews(de, en)).toBeLessThan(0);
    expect(compareNews(en, de)).toBeGreaterThan(0);
  });

  it("innerhalb derselben Sprache: neueste zuerst", () => {
    const alt = { lang: "de" as const, publishedAt: "2026-06-01T00:00:00Z" };
    const neu = { lang: "de" as const, publishedAt: "2026-06-09T00:00:00Z" };
    expect(compareNews(neu, alt)).toBeLessThan(0); // neu vor alt
  });

  it("sortiert eine gemischte Liste korrekt (DE neu, DE alt, EN neu, EN alt)", () => {
    const items = [
      {
        id: "en-neu",
        lang: "en" as const,
        publishedAt: "2026-06-10T00:00:00Z",
      },
      {
        id: "de-alt",
        lang: "de" as const,
        publishedAt: "2026-06-02T00:00:00Z",
      },
      {
        id: "en-alt",
        lang: "en" as const,
        publishedAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "de-neu",
        lang: "de" as const,
        publishedAt: "2026-06-08T00:00:00Z",
      },
    ];
    const order = [...items].sort(compareNews).map((x) => x.id);
    expect(order).toEqual(["de-neu", "de-alt", "en-neu", "en-alt"]);
  });
});

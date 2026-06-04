import { describe, it, expect } from "vitest";
import { classifyImpact } from "../src/features/impactTag.js";

/** Tests der News-Impact-Heuristik (DE + EN, Prioritätsreihenfolge). */
describe("classifyImpact", () => {
  it("erkennt Verletzungen (DE + EN)", () => {
    expect(classifyImpact("Stürmer verletzt", "Muskelfaserriss")).toBe("injury");
    expect(classifyImpact("Striker ruled out", "hamstring injury")).toBe("injury");
  });

  it("erkennt Sperren", () => {
    expect(classifyImpact("Kapitän gesperrt", "Gelb-Rot")).toBe("suspension");
    expect(classifyImpact("Defender banned", "red card")).toBe("suspension");
  });

  it("erkennt Trainer-/Kaderthemen", () => {
    expect(classifyImpact("Neuer Bundestrainer", "Nachfolger benannt")).toBe("coach");
  });

  it("neutrale News → none", () => {
    expect(classifyImpact("Stadion ausverkauft", "Tickets vergriffen")).toBe("none");
  });

  it("Priorität: injury vor coach bei Mischtext", () => {
    expect(classifyImpact("Trainer bestätigt: Star verletzt", "Muskelverletzung")).toBe("injury");
  });
});

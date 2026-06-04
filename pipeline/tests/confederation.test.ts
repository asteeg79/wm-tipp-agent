import { describe, it, expect } from "vitest";
import { isEuropean, isMajorNation } from "../src/features/confederation.js";

/** Tests der Konföderations-/Status-Zuordnung (GS-inspirierte Faktoren). */
describe("confederation", () => {
  it("erkennt UEFA-Teams", () => {
    expect(isEuropean("ESP")).toBe(true);
    expect(isEuropean("GER")).toBe(true);
    expect(isEuropean("SCO")).toBe(true);
    expect(isEuropean("BRA")).toBe(false);
    expect(isEuropean("RSA")).toBe(false);
  });

  it("erkennt Top-Nationen", () => {
    expect(isMajorNation("BRA")).toBe(true);
    expect(isMajorNation("ARG")).toBe(true);
    expect(isMajorNation("GER")).toBe(true);
    expect(isMajorNation("HAI")).toBe(false);
  });
});

/**
 * Externer Prognose-Prior (optional, generisch). Liest eine vom Nutzer gepflegte
 * Datei `data/external/priors.json` mit fremden 1X2-Wahrscheinlichkeiten je
 * Partie und stellt sie der KI als zusätzlichen Anker bereit (market-Slot im
 * Prompt) sowie der App zur "Wir vs. extern"-Anzeige.
 *
 * RECHTLICHER HINWEIS: Diese Datei wird NICHT mitgeliefert/committet
 * (gitignored). Wer fremde, lizenzierte Prognosen (z. B. aus kostenpflichtigen
 * Reports) hier einträgt, ist selbst für die Einhaltung der jeweiligen
 * Nutzungsbedingungen verantwortlich. Der Mechanismus selbst ist neutral.
 *
 * Format (data/external/priors.json):
 *   {
 *     "source": "Beispielquelle",
 *     "matches": {
 *       "<matchId>": { "home": 0.5, "draw": 0.27, "away": 0.23 }
 *     }
 *   }
 * matchId = Dateiname ohne .json (z. B. "wc2026-germany-cura-ao-2026-06-14").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../io/paths.js";

export interface ExternalPriors {
  source: string;
  byMatch: Map<string, { home: number; draw: number; away: number }>;
}

/** Lädt die externen Priors, falls vorhanden; sonst null (graceful). */
export function loadExternalPriors(): ExternalPriors | null {
  const path = join(repoRoot, "data", "external", "priors.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null; // keine Datei → Feature inaktiv
  }
  try {
    const json = JSON.parse(raw) as {
      source?: string;
      matches?: Record<string, { home: number; draw: number; away: number }>;
    };
    const byMatch = new Map<
      string,
      { home: number; draw: number; away: number }
    >();
    for (const [id, p] of Object.entries(json.matches ?? {})) {
      if (
        typeof p?.home === "number" &&
        typeof p?.draw === "number" &&
        typeof p?.away === "number"
      ) {
        byMatch.set(id, p);
      }
    }
    return { source: json.source ?? "extern", byMatch };
  } catch (err) {
    console.warn("[external-priors] ungültiges JSON, ignoriere:", err);
    return null;
  }
}

/**
 * Impact-Tagging per Schlüsselwort-Heuristik (Phase 3). Die feinere Bewertung
 * der News-Materialität übernimmt in Phase 5 die KI.
 */
import type { ImpactTag } from "@wm/shared";

// Schlüsselwörter je Kategorie (DE + EN); `\w*`-Suffixe für Wortstämme sind als
// eigene Einträge kodiert. Aus diesen Listen wird die Erkennungs-Regex gebaut —
// das hält die Muster lesbar/pflegbar (statt einer monolithischen Alternation).
const KEYWORDS: Record<Exclude<ImpactTag, "none">, string[]> = {
  injury: [
    "verletz\\w*",
    "verletzung",
    "ausfall",
    "ausfällt",
    "angeschlagen",
    "muskel\\w*",
    "muskelfaser\\w*",
    "zerrung",
    "kreuzband",
    "bänder\\w*",
    "meniskus",
    "reha",
    "operation",
    "operiert",
    "op\\b",
    "fraglich",
    "fitness",
    "fit",
    "comeback",
    "rückkehr",
    "genes\\w*",
    "krank\\w*",
    "grippe",
    "infekt",
    "injury",
    "injured",
    "injuries",
    "out injured",
    "sidelined",
    "ruled out",
    "knock",
    "strain",
    "hamstring",
    "knee",
    "ankle",
    "setback",
    "doubt",
    "doubtful",
    "fitness test",
    "recovery",
    "return",
  ],
  suspension: [
    "gesperrt",
    "sperre",
    "sperren",
    "gelb-rot\\w*",
    "rote karte",
    "platzverweis",
    "verwarn\\w*",
    "gelbsperre",
    "suspend\\w*",
    "suspension",
    "banned",
    "ban\\b",
    "red card",
    "sent off",
    "booking",
    "accumulation",
  ],
  coach: [
    "trainer\\w*",
    "cheftrainer",
    "bundestrainer",
    "nationaltrainer",
    "co-trainer",
    "trainerwechsel",
    "entlass\\w*",
    "beurlaubt",
    "nachfolger",
    "verpflicht\\w*",
    "berufung",
    "kader\\w*",
    "nominier\\w*",
    "aufstellung",
    "coach",
    "head coach",
    "manager",
    "boss",
    "sacked",
    "fired",
    "appointed",
    "appointment",
    "hire\\w*",
    "named",
    "squad",
    "call-up",
    "line-?up",
    "roster",
  ],
  morale: [
    "streit",
    "unruhe\\w*",
    "krise",
    "zoff",
    "eklat",
    "skandal",
    "wirbel",
    "ärger",
    "moral",
    "stimmung",
    "motivation",
    "geschlossen\\w*",
    "teamgeist",
    "selbstvertrauen",
    "druck",
    "kritik",
    "crisis",
    "turmoil",
    "unrest",
    "row",
    "controversy",
    "tension",
    "rift",
    "dressing room",
    "morale",
    "momentum",
    "confidence",
    "pressure",
    "protest",
    "dispute",
  ],
};

// Reihenfolge = Priorität: spezifische Kategorien (injury, suspension) zuerst,
// allgemeinere (coach, morale) danach. Erste Übereinstimmung gewinnt.
const PATTERNS: { tag: ImpactTag; re: RegExp }[] = (
  ["injury", "suspension", "coach", "morale"] as const
).map((tag) => ({
  tag,
  re: new RegExp(`\\b(${KEYWORDS[tag].join("|")})\\b`, "i"),
}));

/** Bestimmt den Impact-Tag aus Titel + Snippet (erste Übereinstimmung). */
export function classifyImpact(title: string, snippet: string): ImpactTag {
  const text = `${title} ${snippet}`;
  for (const { tag, re } of PATTERNS) {
    if (re.test(text)) return tag;
  }
  return "none";
}

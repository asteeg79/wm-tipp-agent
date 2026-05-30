/**
 * Impact-Tagging per Schlüsselwort-Heuristik (Phase 3). Die feinere Bewertung
 * der News-Materialität übernimmt in Phase 5 die KI.
 */
import type { ImpactTag } from "@wm/shared";

const PATTERNS: { tag: ImpactTag; re: RegExp }[] = [
  {
    tag: "injury",
    re: /\b(verletz|verletzung|ausfall|muskel|kreuzband|operation|out injured|injury|injured|sidelined|ruled out|fitness)\b/i,
  },
  {
    tag: "suspension",
    re: /\b(gesperrt|sperre|rote karte|platzverweis|suspend|suspension|banned|red card)\b/i,
  },
  {
    tag: "coach",
    re: /\b(trainer|cheftrainer|bundestrainer|coach|manager|entlass|sacked|appointed|head coach)\b/i,
  },
  {
    tag: "morale",
    re: /\b(streit|unruhe|krise|zoff|eklat|moral|stimmung|crisis|turmoil|unrest|row|controversy)\b/i,
  },
];

/** Bestimmt den Impact-Tag aus Titel + Snippet (erste Übereinstimmung). */
export function classifyImpact(title: string, snippet: string): ImpactTag {
  const text = `${title} ${snippet}`;
  for (const { tag, re } of PATTERNS) {
    if (re.test(text)) return tag;
  }
  return "none";
}

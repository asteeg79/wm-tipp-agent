/**
 * Impact-Tagging per Schlüsselwort-Heuristik (Phase 3). Die feinere Bewertung
 * der News-Materialität übernimmt in Phase 5 die KI.
 */
import type { ImpactTag } from "@wm/shared";

// Reihenfolge = Priorität: spezifische Kategorien (injury, suspension) zuerst,
// allgemeinere (coach, morale) danach. Erste Übereinstimmung gewinnt.
const PATTERNS: { tag: ImpactTag; re: RegExp }[] = [
  {
    tag: "injury",
    re: /\b(verletz\w*|verletzung|ausfall|ausfällt|angeschlagen|muskel\w*|muskelfaser\w*|zerrung|kreuzband|bänder\w*|meniskus|reha|operation|operiert|op\b|fraglich|fitness|fit|comeback|rückkehr|genes\w*|krank\w*|grippe|infekt|injury|injured|injuries|out injured|sidelined|ruled out|knock|strain|hamstring|knee|ankle|setback|doubt|doubtful|fitness test|recovery|return)\b/i,
  },
  {
    tag: "suspension",
    re: /\b(gesperrt|sperre|sperren|gelb-rot\w*|rote karte|platzverweis|verwarn\w*|gelbsperre|suspend\w*|suspension|banned|ban\b|red card|sent off|booking|accumulation)\b/i,
  },
  {
    tag: "coach",
    re: /\b(trainer\w*|cheftrainer|bundestrainer|nationaltrainer|co-trainer|trainerwechsel|entlass\w*|beurlaubt|nachfolger|verpflicht\w*|berufung|kader\w*|nominier\w*|aufstellung|coach|head coach|manager|boss|sacked|fired|appointed|appointment|hire\w*|named|squad|call-up|line-?up|roster)\b/i,
  },
  {
    tag: "morale",
    re: /\b(streit|unruhe\w*|krise|zoff|eklat|skandal|wirbel|ärger|moral|stimmung|motivation|geschlossen\w*|teamgeist|selbstvertrauen|druck|kritik|crisis|turmoil|unrest|row|controversy|tension|rift|dressing room|morale|momentum|confidence|pressure|protest|dispute)\b/i,
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

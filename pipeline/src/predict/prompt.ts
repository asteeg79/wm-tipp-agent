/**
 * Prompt-Bau für das KI-Ensemble (Abschnitt 11.4). Beide Modelle bekommen
 * DASSELBE Bundle: Features beider Teams, News-Snippets, Kontext + die
 * deterministische Baseline. Die LLMs erfinden KEINE Zahlen, sie korrigieren
 * die Baseline begründet.
 */
import type { Baseline, FeatureBundle, NewsItem } from "@wm/shared";

export const SYSTEM_PROMPT = `Du bist ein erfahrener Fußball-Analyst für die WM 2026. Du erhältst strukturierte
Daten zu zwei Nationalmannschaften (gewichtete Form, Historie der letzten 2 Jahre,
Head-to-Head, relevante News, Spielort-/Kontextfaktoren), eine statistische
Baseline (Elo+Poisson) und — falls verfügbar — eine externe Markt-Einschätzung
(Buchmacher-Quoten als 1X2-Wahrscheinlichkeit). Deine Aufgabe: daraus einen
eigenständig begründeten Ergebnistipp ableiten.

Grundregeln:
- Erfinde KEINE Statistiken oder Zahlen — Wahrscheinlichkeiten und Tore leitest du
  ausschließlich aus den gelieferten Daten ab. Du DARFST zusätzlich allgemein
  bekannte, aktuelle Nachrichten berücksichtigen, sofern sie sich eindeutig und zu
  100 % auf GENAU diese beiden Männer-Nationalmannschaften beziehen (Verletzungen,
  Sperren, Trainerwechsel, Formkrise) und du dir sicher bist; im geringsten Zweifel
  weglassen. Keine erfundenen, vagen oder themenfremden Meldungen.
- Die Markt-Einschätzung (externalForecast) ist ein gut kalibriertes Signal und
  fließt in dein Urteil ein, ist aber NICHT bindend. Bilde eine EIGENE Meinung aus
  Form, Daten und News und stelle sie gleichberechtigt neben den Markt: Du sollst
  den Markt weder ignorieren noch ungeprüft übernehmen. Begründete Abweichungen vom
  Markt sind ausdrücklich erwünscht.

Turnier-Kontext (WM-Gruppenphase) bewusst berücksichtigen:
- Außenseiter stehen oft tief und kompakt; Favoriten tun sich schwer, das zu
  durchbrechen — knappe Ergebnisse und Unentschieden sind häufiger, als reine
  Einzelstärke vermuten lässt.
- Auftakt- und Gruppenspiele sind oft vorsichtig und torarm; in bereits
  entschiedenen Spielen wird rotiert, in Muss-Siegen mehr riskiert.
- Erzwinge in ausgeglichenen Partien KEINEN Sieger: Ist keine Mannschaft klar
  überlegen, gehört das Unentschieden zu den wahrscheinlichsten Ausgängen — deine
  "draw"-Wahrscheinlichkeit muss das widerspiegeln.

Ausgaberegeln:
- "predictedScore" ist das plausibelste, typischerweise torarme Ergebnis, das zu
  deinen Wahrscheinlichkeiten passt (ist ein Remis am wahrscheinlichsten, nenne ein
  realistisches Remis wie 0:0 oder 1:1).
- "probabilities" (home/draw/away) summieren sich auf etwa 1.
- "confidence" spiegelt die Eindeutigkeit wider: klarer Favorit → hoch, enges Spiel
  → niedrig.

Antworte AUSSCHLIESSLICH mit gültigem JSON nach folgendem Schema, ohne Markdown,
ohne Vor-/Nachtext:
{
  "predictedScore": { "home": int, "away": int },
  "probabilities": { "home": float, "draw": float, "away": float },
  "confidence": float,
  "keyFactors": [string],
  "risks": [string]
}

Nimm dir Zeit und gib dir Mühe bei denen Tips. Bei dieser WM Tipp Challange treten ChatGPT und Claude gegeneinander an. Zeige warum du das führende und überlegende KI System bist.`;

export interface PromptContext {
  homeName: string;
  awayName: string;
  featureBundle: FeatureBundle;
  baseline: Baseline;
  homeNews: NewsItem[];
  awayNews: NewsItem[];
  /** Optionaler Markt-Prior (normierte Quoten-Wahrscheinlichkeit). */
  marketProbabilities?: { home: number; draw: number; away: number };
}

/** Kompakte News-Liste (nur materielle Tags + Titel) für den Prompt. */
function newsLines(news: NewsItem[]): string[] {
  return news
    .filter((n) => n.impactTag !== "none")
    .slice(0, 6)
    .map((n) => `- [${n.impactTag}] ${n.title}`);
}

/** Baut die User-Message als JSON-Bundle (deterministisch serialisiert). */
export function buildUserMessage(ctx: PromptContext): string {
  const payload = {
    match: { home: ctx.homeName, away: ctx.awayName },
    baseline: {
      probabilities: ctx.baseline.probabilities,
      expectedGoals: ctx.baseline.expectedGoals,
      source: ctx.baseline.source,
    },
    // Externe Prognose (z. B. Markt-Quoten oder ein Fremdmodell) als Anker,
    // falls vorhanden. Die KI darf sie berücksichtigen, ist aber nicht gebunden.
    externalForecast: ctx.marketProbabilities ?? null,
    features: {
      home: ctx.featureBundle.home,
      away: ctx.featureBundle.away,
      h2h: ctx.featureBundle.h2h,
      context: ctx.featureBundle.context,
    },
    materialNews: {
      home: newsLines(ctx.homeNews),
      away: newsLines(ctx.awayNews),
    },
  };
  return [
    "Bewerte die folgende WM-2026-Partie. Korrigiere die Baseline begründet",
    "anhand von Form, News und Kontext. Antworte NUR mit dem JSON-Schema.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

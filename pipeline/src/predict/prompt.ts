/**
 * Prompt-Bau für das KI-Ensemble (Abschnitt 11.4). Beide Modelle bekommen
 * DASSELBE Bundle: Features beider Teams, News-Snippets, Kontext + die
 * deterministische Baseline. Die LLMs erfinden KEINE Zahlen, sie korrigieren
 * die Baseline begründet.
 */
import type { Baseline, FeatureBundle, NewsItem } from "@wm/shared";

export const SYSTEM_PROMPT = `Du bist ein erfahrener Fußball-Analyst für die WM 2026. Du erhältst strukturierte
Daten zu zwei Nationalmannschaften (gewichtete Form, Historie der letzten 2 Jahre,
Head-to-Head, relevante News, Spielort-/Kontextfaktoren) sowie eine statistische
Baseline (Elo+Poisson). Deine Aufgabe: die Baseline anhand von Form, News und Kontext
begründet anpassen und einen Ergebnistipp abgeben. Erfinde KEINE Statistiken; nutze nur
die gelieferten Daten. Antworte AUSSCHLIESSLICH mit gültigem JSON nach folgendem Schema,
ohne Markdown, ohne Vor-/Nachtext:
{
  "predictedScore": { "home": int, "away": int },
  "probabilities": { "home": float, "draw": float, "away": float },
  "confidence": float,
  "keyFactors": [string],
  "risks": [string]
}`;

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
    market: ctx.marketProbabilities ?? null,
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

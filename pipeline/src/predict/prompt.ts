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
- Nutze "groupStandings" (Tabelle + Spieltag) für den EINSATZ der Partie: In
  bereits gesicherten Situationen wird häufig rotiert/verwaltet, in Muss-Siegen
  mehr riskiert; ein Team, dem ein Remis reicht, agiert anders als eines, das
  zwingend gewinnen muss. Das Torniveau leitest du aus den Daten ab — präjudiziere
  es NICHT als generell "torarm" (manche Turniere sind torreich).
- Nutze "recentResults" (jüngste Spiele mit Gegner + Ergebnis) für Momentum und
  Gegnerqualität — ein 3:0 gegen ein Spitzenteam wiegt schwerer als gegen einen
  Außenseiter. Die Aggregat-Form allein verschenkt diese Information.
- Erzwinge in ausgeglichenen Partien KEINEN Sieger: Ist keine Mannschaft klar
  überlegen, gehört das Unentschieden zu den wahrscheinlichsten Ausgängen — deine
  "draw"-Wahrscheinlichkeit muss das widerspiegeln.

K.-o.-Spiele (Feld "knockout": true) — WICHTIG:
- predictedScore und probabilities beziehen sich auf das Ergebnis nach
  REGULÄREN 90 Minuten — ein Unentschieden ist hier ausdrücklich erlaubt und oft
  realistisch (K.-o.-Spiele sind häufig eng). Erfinde KEINEN 90-Minuten-Sieger.
- Zusätzlich: Gib "tiebreakWinProbHome" an = Wahrscheinlichkeit (0..1), dass das
  HEIM-Team die Verlängerung bzw. das Elfmeterschießen gewinnt, FALLS es nach
  90 Minuten unentschieden steht. Berücksichtige Elfmeter-Stärke/-Erfahrung,
  Nervenstärke, Kaderbreite für die Verlängerung; ohne klare Anhaltspunkte ~0.5.
- Bei Gruppenspielen ("knockout": false) lässt du "tiebreakWinProbHome" weg.

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
  "risks": [string],
  "tiebreakWinProbHome": float   // nur bei K.-o.-Spielen, sonst weglassen
}

Nimm dir Zeit und gib dir Mühe bei deinen Tipps. Bei dieser WM-Tipp-Challenge treten ChatGPT und Claude gegeneinander an. Zeige, warum du das führende und überlegene KI-System bist.`;

/** Eine Tabellenzeile der Gruppe (aktueller Stand, nur gespielte Partien). */
export interface GroupStandingRow {
  team: string;
  played: number;
  points: number;
  goalDiff: number;
  goalsFor: number;
}

/** Gruppenstand + Spieltag der Partie (Einsatz-Kontext für die KI). */
export interface GroupContext {
  groupId: string;
  /** Spieltag dieser Partie (1–3). */
  matchday: number;
  /** Verbleibende Gruppenspiele je Team NACH dieser Partie. */
  remainingAfter: number;
  /** Tabelle nach FIFA-Kriterien sortiert. */
  table: GroupStandingRow[];
}

/** Ein jüngstes Ergebnis (für Momentum + Gegnerqualität). */
export interface RecentResult {
  date: string;
  opponent: string;
  scored: number;
  conceded: number;
  venue: "home" | "away" | "neutral";
  competition: string;
}

export interface PromptContext {
  homeName: string;
  awayName: string;
  featureBundle: FeatureBundle;
  baseline: Baseline;
  homeNews: NewsItem[];
  awayNews: NewsItem[];
  /** Optionaler Markt-Prior (normierte Quoten-Wahrscheinlichkeit). */
  marketProbabilities?: { home: number; draw: number; away: number };
  /** Aktueller Gruppenstand + Spieltag (Einsatz der Partie). */
  groupContext?: GroupContext;
  /** Jüngste Ergebnisse (neueste zuerst) je Team. */
  homeRecent?: RecentResult[];
  awayRecent?: RecentResult[];
  /** K.-o.-Spiel? → 90-Min-Tipp (Remis erlaubt) + tiebreakWinProbHome. */
  isKnockout?: boolean;
}

/**
 * Materielle News als strukturierte Objekte (Tag, Titel, Datum, kurzer Text).
 * Datum + Snippet helfen der KI, Schwere und Aktualität einzuordnen, statt nur
 * aus dem Titel zu raten.
 */
function newsItems(news: NewsItem[]): Array<Record<string, string>> {
  return news
    .filter((n) => n.impactTag !== "none")
    .slice(0, 6)
    .map((n) => ({
      tag: n.impactTag,
      title: n.title,
      date: n.publishedAt.slice(0, 10),
      ...(n.snippet ? { snippet: n.snippet.slice(0, 200) } : {}),
    }));
}

/** Baut die User-Message als JSON-Bundle (deterministisch serialisiert). */
export function buildUserMessage(ctx: PromptContext): string {
  const payload = {
    match: { home: ctx.homeName, away: ctx.awayName },
    // K.-o.-Spiel → predictedScore = 90 Min (Remis erlaubt) + tiebreakWinProbHome.
    knockout: ctx.isKnockout ?? false,
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
    // Gruppenstand + Spieltag (Einsatz) und jüngste Ergebnisse (Momentum/
    // Gegnerqualität) — falls vorhanden.
    groupStandings: ctx.groupContext ?? null,
    recentResults: {
      home: ctx.homeRecent ?? [],
      away: ctx.awayRecent ?? [],
    },
    materialNews: {
      home: newsItems(ctx.homeNews),
      away: newsItems(ctx.awayNews),
    },
  };
  return [
    "Bewerte die folgende WM-2026-Partie. Korrigiere die Baseline begründet",
    "anhand von Form, News und Kontext. Antworte NUR mit dem JSON-Schema.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

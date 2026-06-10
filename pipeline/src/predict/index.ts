/**
 * KI-Ensemble-Orchestrator (Abschnitt 11.4–11.5).
 * Ruft Claude + ChatGPT für eine Partie, validiert, reconciled und liefert
 * die finale Prediction. Re-Trigger-Entscheidung erfolgt im Aufrufer.
 */
import type { Baseline, FeatureBundle, NewsItem, Prediction } from "@wm/shared";
import { buildUserMessage } from "./prompt.js";
import { ChatGptClient, ClaudeClient, type ModelClient } from "./models.js";
import { mapLimit } from "../util/async.js";
import { config } from "../../config.js";
import { reconcile, type ModelResult } from "./reconcile.js";
import type { LlmPrediction } from "./schema.js";
import type { EnsembleWeights } from "./ensembleWeights.js";

export interface Ensemble {
  /** Mindestens ein Modell verfügbar? */
  readonly active: boolean;
  readonly modelIds: string[];
  evaluate(input: EvaluateInput): Promise<Prediction>;
  /**
   * Bewertet viele Partien in einem Rutsch: Claude bündelt via
   * Message-Batches-API (50 % günstiger), ChatGPT läuft parallel direkt.
   * Liefert je Eingabe IMMER eine Prediction (Modellfehler → die übrigen
   * Modelle bzw. Baseline tragen, wie bei evaluate()).
   */
  evaluateMany(inputs: EvaluateInput[]): Promise<Prediction[]>;
}

export interface EvaluateInput {
  homeName: string;
  awayName: string;
  featureBundle: FeatureBundle;
  baseline: Baseline;
  homeNews: NewsItem[];
  awayNews: NewsItem[];
  inputHash: string;
  now: Date;
  marketProbabilities?: { home: number; draw: number; away: number };
  /** Accuracy-Gewichte aus beendeten Partien (computeModelWeights). */
  modelWeights?: EnsembleWeights | null;
}

class EnsembleImpl implements Ensemble {
  private clients: ModelClient[];

  constructor(clients: ModelClient[]) {
    this.clients = clients.filter((c) => c.available);
  }

  get active(): boolean {
    return this.clients.length > 0;
  }
  get modelIds(): string[] {
    return this.clients.map((c) => c.id);
  }

  async evaluate(input: EvaluateInput): Promise<Prediction> {
    const userMessage = buildUserMessage({
      homeName: input.homeName,
      awayName: input.awayName,
      featureBundle: input.featureBundle,
      baseline: input.baseline,
      homeNews: input.homeNews,
      awayNews: input.awayNews,
      ...(input.marketProbabilities
        ? { marketProbabilities: input.marketProbabilities }
        : {}),
    });

    // Beide Modelle parallel; ein Modellfehler darf den Tipp nicht killen.
    const settled = await Promise.allSettled(
      this.clients.map(async (c) => ({
        id: c.id,
        prediction: await c.predict(userMessage),
      })),
    );

    const results: ModelResult[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else console.warn("[predict] Modell-Fehler:", s.reason);
    }

    return reconcile(
      results,
      input.baseline,
      input.now,
      input.inputHash,
      input.modelWeights,
    );
  }

  async evaluateMany(inputs: EvaluateInput[]): Promise<Prediction[]> {
    const messages = inputs.map((input) =>
      buildUserMessage({
        homeName: input.homeName,
        awayName: input.awayName,
        featureBundle: input.featureBundle,
        baseline: input.baseline,
        homeNews: input.homeNews,
        awayNews: input.awayNews,
        ...(input.marketProbabilities
          ? { marketProbabilities: input.marketProbabilities }
          : {}),
      }),
    );

    // Je Client alle Antworten einsammeln (Batch wenn unterstützt, sonst
    // parallele Direkt-Calls). Ein Client-Totalausfall liefert Errors je Item.
    const byClient = await Promise.all(
      this.clients.map(async (c): Promise<(LlmPrediction | Error)[]> => {
        try {
          if (c.predictMany) return await c.predictMany(messages);
          return await mapLimit(
            messages,
            config.batching.directConcurrency,
            (msg) =>
              c
                .predict(msg)
                .catch((e: unknown) =>
                  e instanceof Error ? e : new Error(String(e)),
                ),
          );
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          return messages.map(() => e);
        }
      }),
    );

    // Pro Partie reconcilen — exakt dieselbe Semantik wie evaluate().
    return inputs.map((input, i) => {
      const results: ModelResult[] = [];
      this.clients.forEach((c, ci) => {
        const r = byClient[ci]![i]!;
        if (r instanceof Error) {
          console.warn(
            `[predict] ${c.id} (${input.homeName}–${input.awayName}):`,
            r.message,
          );
        } else {
          results.push({ id: c.id, prediction: r });
        }
      });
      return reconcile(
        results,
        input.baseline,
        input.now,
        input.inputHash,
        input.modelWeights,
      );
    });
  }
}

/** Test-Factory: Ensemble aus beliebigen (auch Fake-)Clients bauen. */
export function makeEnsembleFrom(clients: ModelClient[]): Ensemble {
  return new EnsembleImpl(clients);
}

/** Baut das Ensemble aus den env-Keys (graceful: ohne Key → inaktiv). */
export function makeEnsemble(): Ensemble {
  const anthropicKey = sanitize(process.env.ANTHROPIC_API_KEY);
  const openaiKey = sanitize(process.env.OPENAI_API_KEY);
  return new EnsembleImpl([
    new ClaudeClient(anthropicKey),
    new ChatGptClient(openaiKey),
  ]);
}

/** Filtert Platzhalter-/Leerwerte heraus, damit sie nicht als Key gelten. */
function sanitize(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (/your_|_here|^$/.test(v)) return undefined;
  return v;
}

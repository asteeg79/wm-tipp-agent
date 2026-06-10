/**
 * KI-Modell-Clients (Abschnitt 11.4): Claude (@anthropic-ai/sdk) + ChatGPT
 * (openai). Beide liefern strukturiertes JSON nach LlmPrediction. Bei
 * ungültigem JSON genau 1 Retry mit Korrektur-Hinweis. Keys nur aus env.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { config } from "../../config.js";
import { LlmPrediction, LlmPredictionRaw } from "./schema.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export interface ModelClient {
  readonly id: "claude" | "chatgpt";
  readonly available: boolean;
  predict(userMessage: string): Promise<LlmPrediction>;
  /**
   * Optional: viele Tipps in einem Rutsch (z. B. via Message-Batches-API,
   * 50 % günstiger). Liefert je Eingabe Prediction ODER Error — ein
   * Einzelfehler darf die übrigen Tipps nicht blockieren.
   */
  predictMany?(userMessages: string[]): Promise<(LlmPrediction | Error)[]>;
}

/** Promise.all mit begrenzter Nebenläufigkeit (schont Rate-Limits). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Extrahiert das erste JSON-Objekt aus einer Modellantwort. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Keine JSON-Struktur in der Antwort gefunden");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/** Validiert + parst; wirft bei Schema-Verstoß. */
function parsePrediction(text: string): LlmPrediction {
  return LlmPrediction.parse(extractJson(text));
}

const RETRY_HINT =
  "Deine letzte Antwort war kein gültiges JSON nach dem Schema. " +
  "Antworte AUSSCHLIESSLICH mit dem geforderten JSON, ohne Markdown.";

// --- Claude ---------------------------------------------------------------

export class ClaudeClient implements ModelClient {
  readonly id = "claude" as const;
  readonly available: boolean;
  private client: Anthropic | null = null;
  private model = config.models.claude;

  constructor(apiKey: string | undefined) {
    this.available = !!apiKey;
    if (apiKey) this.client = new Anthropic({ apiKey });
  }

  /**
   * Request-Parameter (für Direkt-Call UND Batch identisch):
   * Structured Outputs — die API liefert garantiert schema-konformes JSON
   * (kein Regex-Extrahieren nötig). Adaptives Denken lässt das Modell bei
   * kniffligen Partien selbstständig länger überlegen; die Denk-Tokens
   * zählen in max_tokens mit — daher großzügiges Limit.
   */
  private params(msg: string) {
    return {
      model: this.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" as const },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user" as const, content: msg }],
      output_config: { format: zodOutputFormat(LlmPredictionRaw) },
    };
  }

  /** Extrahiert die LlmPrediction aus einer (Batch-)Message-Antwort. */
  private parseMessage(message: {
    content: Anthropic.ContentBlock[];
  }): LlmPrediction {
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Claude-Antwort ohne Text-Block");
    }
    // Structured Output garantiert valides JSON im Text-Block.
    return LlmPrediction.parse(JSON.parse(block.text));
  }

  async predict(userMessage: string): Promise<LlmPrediction> {
    if (!this.client) throw new Error("Claude nicht konfiguriert");
    const call = async (msg: string): Promise<LlmPrediction> => {
      const res = await this.client!.messages.parse(this.params(msg));
      if (!res.parsed_output) {
        throw new Error("Claude lieferte kein parsebares Structured Output");
      }
      // Transform (keyFactors/risks kürzen) über das Vollschema anwenden.
      return LlmPrediction.parse(res.parsed_output);
    };
    try {
      return await call(userMessage);
    } catch {
      return call(`${userMessage}\n\n${RETRY_HINT}`);
    }
  }

  /**
   * Viele Tipps in einem Lauf — via Message-Batches-API (50 % günstiger).
   * Robustheits-Kaskade:
   *  1) Unter minSize oder deaktiviert → normale Direkt-Calls (mapLimit).
   *  2) Batch nicht fertig bis pollBudget → cancel + Direkt-Calls.
   *  3) Einzelne Batch-Items fehlgeschlagen → Einzel-Fallback nur für diese.
   *  4) Batch-API-Fehler → Direkt-Calls für alles.
   */
  async predictMany(
    userMessages: string[],
  ): Promise<(LlmPrediction | Error)[]> {
    if (!this.client) throw new Error("Claude nicht konfiguriert");
    const b = config.batching;
    if (!b.enabled || userMessages.length < b.minSize) {
      return this.predictManyDirect(userMessages);
    }
    try {
      const batch = await this.client.messages.batches.create({
        requests: userMessages.map((msg, i) => ({
          custom_id: `m${i}`,
          params: this.params(msg),
        })),
      });
      console.log(
        `[predict] Claude-Batch ${batch.id} mit ${userMessages.length} Partien eingereicht`,
      );

      const deadline = Date.now() + b.pollBudgetMs;
      let status = batch;
      while (status.processing_status !== "ended") {
        if (Date.now() > deadline) {
          // Zeitbudget erschöpft → abbrechen und direkt rechnen, damit die
          // Tipps (z. B. T-3h vor Anpfiff) in DIESEM Lauf noch landen.
          await this.client.messages.batches
            .cancel(batch.id)
            .catch(() => undefined);
          console.warn("[predict] Claude-Batch Timeout → Direkt-Calls");
          return this.predictManyDirect(userMessages);
        }
        await sleep(b.pollIntervalMs);
        status = await this.client.messages.batches.retrieve(batch.id);
      }

      const out: (LlmPrediction | Error)[] = userMessages.map(
        () => new Error("Antwort fehlt im Batch-Ergebnis"),
      );
      for await (const r of await this.client.messages.batches.results(
        batch.id,
      )) {
        const i = Number(r.custom_id.slice(1));
        if (!Number.isInteger(i) || i < 0 || i >= out.length) continue;
        if (r.result.type === "succeeded") {
          try {
            out[i] = this.parseMessage(r.result.message);
          } catch (e) {
            out[i] = toError(e);
          }
        } else {
          out[i] = new Error(`Batch-Ergebnis: ${r.result.type}`);
        }
      }

      // Einzel-Fallback nur für fehlgeschlagene/fehlende Items.
      for (let i = 0; i < out.length; i++) {
        if (!(out[i] instanceof Error)) continue;
        try {
          out[i] = await this.predict(userMessages[i]!);
        } catch (e) {
          out[i] = toError(e);
        }
      }
      return out;
    } catch (err) {
      console.warn(
        "[predict] Claude-Batch fehlgeschlagen → Direkt-Calls:",
        err,
      );
      return this.predictManyDirect(userMessages);
    }
  }

  private predictManyDirect(
    userMessages: string[],
  ): Promise<(LlmPrediction | Error)[]> {
    return mapLimit(userMessages, config.batching.directConcurrency, (msg) =>
      this.predict(msg).catch(toError),
    );
  }
}

// --- ChatGPT --------------------------------------------------------------

export class ChatGptClient implements ModelClient {
  readonly id = "chatgpt" as const;
  readonly available: boolean;
  private client: OpenAI | null = null;
  private model = config.models.chatgpt;

  constructor(apiKey: string | undefined) {
    this.available = !!apiKey;
    if (apiKey) this.client = new OpenAI({ apiKey });
  }

  async predict(userMessage: string): Promise<LlmPrediction> {
    if (!this.client) throw new Error("ChatGPT nicht konfiguriert");
    const call = async (msg: string): Promise<string> => {
      const res = await this.client!.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: msg },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    };
    try {
      return parsePrediction(await call(userMessage));
    } catch {
      return parsePrediction(await call(`${userMessage}\n\n${RETRY_HINT}`));
    }
  }
}

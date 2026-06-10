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
}

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

  async predict(userMessage: string): Promise<LlmPrediction> {
    if (!this.client) throw new Error("Claude nicht konfiguriert");
    // Structured Outputs: die API liefert garantiert schema-konformes JSON
    // (kein Regex-Extrahieren nötig). Adaptives Denken lässt das Modell bei
    // kniffligen Partien selbstständig länger überlegen; die Denk-Tokens
    // zählen in max_tokens mit — daher großzügiges Limit.
    const call = async (msg: string): Promise<LlmPrediction> => {
      const res = await this.client!.messages.parse({
        model: this.model,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: msg }],
        output_config: { format: zodOutputFormat(LlmPredictionRaw) },
      });
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

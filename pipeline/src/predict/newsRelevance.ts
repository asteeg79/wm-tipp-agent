/**
 * KI-gestützter News-Relevanzfilter (ressourcenschonend).
 *
 * Ziel: Fehltreffer aus der RSS-/Google-News-Aggregation entfernen (andere
 * Sportarten, falsche Teams, reine Namensgleichheit). Die Heuristik kann das
 * nicht perfekt; ein günstiges Sprachmodell entscheidet zuverlässig, ob eine
 * Schlagzeile wirklich die **Männer-Fußballnationalmannschaft** des Teams und
 * deren WM-relevanten Kontext betrifft.
 *
 * Sparsamkeit:
 *  - **Genau ein API-Call pro Team** (alle Kandidaten gebündelt, nur Titel).
 *  - Günstiges Modell (config.models.newsFilter, claude-haiku-4-5) mit
 *    Structured Outputs → garantiert ein JSON-Index-Array, kein Text-Parsen.
 *  - Ergebnis wird per **Inhalts-Hash gecacht** → unveränderte Kandidaten
 *    lösen keinen erneuten Call aus.
 *  - Bei jedem Fehler: Eingabe unverändert zurück (lieber etwas Rauschen als
 *    fehlende News — News sind essenziell für die Bewertung).
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { config } from "../../config.js";
import { cacheGet, cacheSet } from "../io/cache.js";
import type { NewsRelevanceFilter } from "../features/news.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

/** Structured-Output-Schema: Indizes der relevanten Schlagzeilen. */
const RelevanceAnswer = z.object({
  relevant: z.array(z.number().int().min(0)),
});

/**
 * Parst die Modellantwort zu einer Menge gültiger Indizes (0-basiert, < n).
 * Akzeptiert ein JSON-Array (`[0,2,5]`) irgendwo in der Antwort; ignoriert
 * Out-of-Range-Werte. Pure Funktion (für Unit-Tests exportiert) — dient bei
 * Structured Outputs als zweite Validierungsstufe (Range/Duplikate).
 */
export function parseRelevantIndices(text: string, n: number): number[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out = new Set<number>();
  for (const v of arr) {
    const i = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(i) && i >= 0 && i < n) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

function buildPrompt(teamName: string, titles: string[]): string {
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  return [
    `Du prüfst Schlagzeilen auf Relevanz für die WM-2026-Prognose der`,
    `Männer-Fußballnationalmannschaft von "${teamName}".`,
    `RELEVANT ist nur, was dieses Team und seinen Fußball betrifft (Kader,`,
    `Form, Verletzungen, Sperren, Trainer, Taktik, Testspiele, WM-Vorbereitung).`,
    `NICHT relevant: andere Sportarten, andere Länder/Vereine, reine`,
    `Namensgleichheit (z. B. "Tour de France"), Frauen-/Jugendteams, Werbung.`,
    `Gib die Indizes der relevanten Schlagzeilen zurück. Im Zweifel weglassen.`,
    ``,
    list,
  ].join("\n");
}

/**
 * Baut den Filter, wenn ein Anthropic-Key vorhanden ist; sonst `null`
 * (Aufrufer nutzt dann nur die Heuristik).
 */
export function makeNewsRelevanceFilter(
  apiKey: string | undefined,
): NewsRelevanceFilter | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const model = config.models.newsFilter;

  return async (teamName, items) => {
    if (items.length === 0) return items;
    const titles = items.map((i) => i.title);
    const cacheKey = `newsrel:${sha(teamName + "\n" + titles.join("\n"))}`;

    let keep = await cacheGet<number[]>(cacheKey, CACHE_TTL_MS);
    if (keep === null) {
      try {
        const res = await client.messages.parse({
          model,
          max_tokens: 512,
          messages: [{ role: "user", content: buildPrompt(teamName, titles) }],
          output_config: { format: zodOutputFormat(RelevanceAnswer) },
        });
        const relevant = res.parsed_output?.relevant ?? [];
        // Zweite Stufe: Range prüfen, Duplikate entfernen, sortieren.
        keep = parseRelevantIndices(JSON.stringify(relevant), items.length);
        await cacheSet(cacheKey, keep);
      } catch (err) {
        console.warn(`[news-filter] ${teamName} übersprungen:`, err);
        return items; // graceful: keine News verlieren
      }
    }
    const set = new Set(keep);
    return items.filter((_, i) => set.has(i));
  };
}

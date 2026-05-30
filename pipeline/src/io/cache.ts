/**
 * Einfacher Datei-Cache für rohe API-Antworten + Fortschritts-Persistenz.
 *
 * Strategie (Abschnitt 10.3):
 * - Historie ist unveränderlich → vergangene Saisons werden dauerhaft gecacht.
 * - Die laufende/aktuelle Saison wird mit kurzer TTL gecacht (Deltas).
 * - Fortschritt (welche Teams gebackfillt sind) wird persistiert, damit der
 *   Free-Tier-Lauf über mehrere Durchläufe verteilt fortgesetzt werden kann.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir } from "./paths.js";

const rawDir = join(cacheDir, "raw");
const progressPath = join(cacheDir, "progress.json");

interface CacheEnvelope<T> {
  storedAt: string;
  value: T;
}

function keyToFile(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return join(rawDir, `${hash}.json`);
}

/**
 * Liest einen Cache-Eintrag. `ttlMs = Infinity` → nie ablaufen (immutable).
 * Gibt null zurück bei Miss/Ablauf.
 */
export async function cacheGet<T>(
  key: string,
  ttlMs: number,
): Promise<T | null> {
  try {
    const raw = await readFile(keyToFile(key), "utf8");
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (ttlMs !== Infinity) {
      const age = Date.now() - new Date(env.storedAt).getTime();
      if (age > ttlMs) return null;
    }
    return env.value;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Schreibt einen Cache-Eintrag. */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  await mkdir(rawDir, { recursive: true });
  const env: CacheEnvelope<T> = {
    storedAt: new Date().toISOString(),
    value,
  };
  await writeFile(keyToFile(key), JSON.stringify(env), "utf8");
}

export interface Progress {
  /** teamId → ISO-Zeitpunkt des letzten vollständigen Backfills. */
  teamsBackfilled: Record<string, string>;
}

export async function readProgress(): Promise<Progress> {
  try {
    const raw = await readFile(progressPath, "utf8");
    return JSON.parse(raw) as Progress;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { teamsBackfilled: {} };
    }
    throw err;
  }
}

export async function writeProgress(p: Progress): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(progressPath, JSON.stringify(p, null, 2), "utf8");
}

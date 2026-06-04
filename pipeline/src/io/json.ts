/**
 * zod-validiertes Lesen/Schreiben von JSON-Dateien.
 * Alle JSON-I/O läuft hierüber, damit Schreibvorgänge garantiert dem Schema
 * entsprechen (Leitplanke 3 der Spezifikation).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

// Schemas mit .default() haben abweichende Input-/Output-Typen → Input unknown.
type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** Liest und validiert eine JSON-Datei gegen ein Schema. */
export async function readJson<T>(path: string, schema: Schema<T>): Promise<T> {
  const raw = await readFile(path, "utf8");
  return schema.parse(JSON.parse(raw));
}

/** Liest und validiert, gibt null zurück, falls Datei fehlt. */
export async function readJsonOptional<T>(
  path: string,
  schema: Schema<T>,
): Promise<T | null> {
  try {
    return await readJson(path, schema);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Validiert gegen das Schema und schreibt hübsch formatiert. */
export async function writeJson<T>(
  path: string,
  schema: Schema<T>,
  value: T,
): Promise<void> {
  const validated = schema.parse(value);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(validated, null, 2) + "\n", "utf8");
}

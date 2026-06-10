/** Zentrale Async-Helfer der Pipeline (zuvor in models.ts/http.ts dupliziert). */

/** Promise-basiertes Warten. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

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

/** Beliebigen Throw-Wert in ein Error-Objekt überführen. */
export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

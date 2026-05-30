/**
 * Schlanker HTTP-JSON-Client mit exponentiellem Backoff für 429/5xx.
 * Wird von den Providern genutzt; respektiert Rate-Limits (Abschnitt 10.3).
 */

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  maxRetries: number;
  backoffBaseMs: number;
  /** Optionaler Timeout pro Versuch (ms). */
  timeoutMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Holt eine Textressource. Gibt bei 404 `null` zurück (für optionale Dateien),
 * wiederholt bei 429/5xx mit Backoff.
 */
export async function fetchText(
  url: string,
  opts: FetchJsonOptions,
): Promise<string | null> {
  const { headers, maxRetries, backoffBaseMs, timeoutMs = 25_000 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: headers ?? {},
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const wait = backoffBaseMs * 2 ** attempt + Math.random() * 250;
        lastErr = new Error(`HTTP ${res.status} für ${url}`);
        if (attempt < maxRetries) {
          await sleep(wait);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(backoffBaseMs * 2 ** attempt + Math.random() * 250);
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(`fetchText fehlgeschlagen: ${url}`);
}

/**
 * Holt JSON von `url`. Wiederholt bei 429 und 5xx mit exponentiellem Backoff
 * (+Jitter). Wirft bei endgültigem Fehlschlag.
 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions,
): Promise<T> {
  const { headers, maxRetries, backoffBaseMs, timeoutMs = 25_000 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: headers ?? {},
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        // Rate-Limit oder Serverfehler → Backoff und erneut versuchen.
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffBaseMs * 2 ** attempt + Math.random() * 250;
        lastErr = new Error(`HTTP ${res.status} für ${url}`);
        if (attempt < maxRetries) {
          await sleep(wait);
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} für ${url}: ${await res.text()}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      // Netzwerk-/Abort-Fehler ebenfalls mit Backoff erneut versuchen.
      if (attempt < maxRetries) {
        await sleep(backoffBaseMs * 2 ** attempt + Math.random() * 250);
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(`fetchJson fehlgeschlagen: ${url}`);
}

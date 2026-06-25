export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

const REPO = "asteeg79/wm-tipp-agent";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Löst einen Force-Neubewertungslauf der KOMMENDEN Partien aus: feuert ein
 * GitHub `repository_dispatch` (event_type "refresh-data") mit force=true und
 * 24-h-Fenster — genau der manuelle Lauf aus refresh.yml.
 *
 * Das GitHub-Token liegt ausschließlich serverseitig als Vercel-Env
 * `GITHUB_DISPATCH_TOKEN` (fine-grained PAT, Permission „Contents: write" für
 * dieses Repo) — NIE im Client. Der Endpunkt ist zusätzlich durch Cloudflare
 * Access + Origin-Guard geschützt (nur authentifizierte Aufrufe über die Domain
 * erreichen ihn). Ohne gesetztes Token antwortet er mit 503 (kein Effekt).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return json({ ok: false, error: "not_configured" }, 503);

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wm-tipp-agent",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "refresh-data",
      client_payload: { mode: "predict", force: true, window: "24" },
    }),
  });

  if (res.status === 204) return json({ ok: true });
  const detail = (await res.text()).slice(0, 300);
  return json({ ok: false, status: res.status, error: detail }, 502);
}

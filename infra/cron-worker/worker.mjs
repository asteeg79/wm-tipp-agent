/**
 * Externer Taktgeber für die Daten-Pipeline (siehe docs/betrieb.md).
 *
 * Cloudflare-Cron-Trigger sind — anders als GitHub-`schedule` — exakt und
 * werden nicht gedrosselt. Dieser Worker feuert per `repository_dispatch`
 * den refresh-Workflow (event_type "refresh-data"); GitHub stellt
 * Dispatch-Events zuverlässig zu.
 *
 * Secret (über `wrangler secret put`, NIE im Code): GITHUB_PAT —
 * fine-grained PAT, nur Repo wm-tipp-agent, Permission "Contents: R/W".
 */
const REPO = "asteeg79/wm-tipp-agent";

export default {
  async scheduled(_event, env) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "wm-tipp-cron-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "refresh-data",
        client_payload: { mode: "predict" },
      }),
    });
    // 204 = angenommen. Alles andere loggen (sichtbar via `wrangler tail`
    // bzw. Dashboard → Worker → Logs).
    if (res.status === 204) {
      console.log("refresh-data dispatch OK");
    } else {
      console.error(
        `dispatch fehlgeschlagen: HTTP ${res.status} — ${await res.text()}`,
      );
    }
  },
};

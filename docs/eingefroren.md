# Projekt eingefroren — Stand 27.07.2026

Die WM 2026 endete am **19.07.2026** (Finale Spanien–Argentinien). Das Projekt
liegt seit dem 27.07.2026 still und soll zur **nächsten Europameisterschaft
(UEFA Euro 2028, Juni/Juli 2028 in UK & Irland)** wieder aufgesetzt werden.

Die App bleibt als Archiv erreichbar: <https://wm-tipp-agent-app.vercel.app>.
Alle Daten unter `data/` sind der Endstand des Turniers.

## Was abgeschaltet wurde

| Was | Zustand | Wie zurückgenommen |
|---|---|---|
| `news.yml` (alle 2 h) | `disabled_manually` | `gh workflow enable news.yml` |
| `predict-daily.yml` (täglich 05:23) | `disabled_manually` | `gh workflow enable predict-daily.yml` |
| `predict-hourly.yml` (T-4 h) | `disabled_manually` | `gh workflow enable predict-hourly.yml` |
| `refresh.yml` (`repository_dispatch`) | `disabled_manually` | `gh workflow enable refresh.yml` |
| `deploy.yml` (GitHub Pages, manuell) | `disabled_manually` | `gh workflow enable deploy.yml` |
| GitHub Secrets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ODDS_API_KEY` | gelöscht | `gh secret set <NAME>` |
| Lokale `.env` | Werte geleert, Struktur erhalten | Keys neu eintragen |

`ci.yml` bleibt **aktiv** — es läuft nur bei Code-Pushes, braucht keine Secrets
und kostet im Ruhezustand nichts. `_alert.yml` ist ein reusable Workflow und
wird nur von den (deaktivierten) Pipeline-Jobs aufgerufen.

Deaktivierte Workflows reagieren **weder auf `schedule` noch auf
`repository_dispatch` oder `workflow_dispatch`** — das neutralisiert auch den
Cloudflare-Cron, selbst wenn dieser noch feuert.

## Noch manuell zu erledigen (nicht per CLI möglich)

1. **Cloudflare-Worker `wm-tipp-cron`** (`infra/cron-worker/`) — Cron-Trigger
   entfernen oder Worker löschen (Dashboard → Workers → `wm-tipp-cron`).
   Sein Monats-Guard in `worker.mjs` begrenzt Dispatches ohnehin auf Juni/Juli,
   ab 01.08.2026 ist er also von sich aus still. Das dort hinterlegte Secret
   `GITHUB_PAT` sollte gelöscht werden.
2. **GitHub-PAT widerrufen** — der fine-grained PAT für den Worker
   (Scope: Repo `wm-tipp-agent`, Contents R/W) unter
   Settings → Developer settings → Personal access tokens.
3. **API-Keys beim Anbieter rotieren/löschen** — das Entfernen aus GitHub und
   `.env` macht die Keys nicht ungültig: Anthropic Console, OpenAI Platform,
   The Odds API.
4. **Vercel-Projekt pausieren** — sonst deployt es bei jedem künftigen Push neu.
   Da keine Data-Commits mehr entstehen, passiert das aber nur bei echter
   Code-Arbeit.

## Zum Reaktivieren für die EM 2028

Über das Abschalten hinaus ist inhaltlich zu tun:

- **Turnierdaten umstellen:** `data/index.json` und `data/matches/` sind
  WM-2026-spezifisch (104 Spiele, 48 Teams, IDs `wc2026-*`). Die EM hat 24 Teams
  und ein anderes Format. Die openfootball-Quelle liefert `euro.json` statt
  `worldcup.json` — Provider in der Pipeline anpassen.
- **Zeitfenster:** Der Monats-Guard im Cloudflare-Worker (`worker.mjs`) und die
  UTC-Stundenfenster im Cron sind auf Jun/Jul + CEST ausgelegt — für 2028
  prüfen, aber wahrscheinlich unverändert passend.
- **Modellversionen:** `docs/ki-bewertung.md` nennt Claude Opus 4.8; bis 2028
  gibt es neuere Modelle. Model-IDs und Preise vor dem Start aktualisieren.
- Danach Secrets neu setzen und die Workflows in der Tabelle oben wieder
  aktivieren.

Der Betriebsablauf selbst ist unverändert in `docs/betrieb.md` beschrieben.

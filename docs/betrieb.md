# Betriebskonzept — WM-Tipp-Assistent 2026

Stand: 13.06.2026 (WM läuft). Dieses Dokument beschreibt alle automatischen
Jobs, ihre Aufgaben, Frequenzen und Schutzmechanismen — und wie die
Daten-Frische im Turnierbetrieb sichergestellt und die KI-Kosten begrenzt
werden.

## Datenarten & Aktualitätsbedarf

| Datenart | Quelle | Zeitkritik | Mechanismus |
|---|---|---|---|
| Ergebnisse + Spielplan | openfootball `worldcup.json` | **hoch** (Spieltage) | jeder Pipeline-Lauf, Cache-TTL 10 min |
| KI-Tipps (Claude Opus 4.8 + ChatGPT) | Anthropic/OpenAI | mittel (Milestones T-24/4 h) | `predict`-Läufe; Retrigger-Logik; Claude via Batches-API |
| News je Team | Google News RSS + kicker/Sportschau/… | niedrig (Stunden) | `news`-Läufe alle 3 h; KI-Relevanzfilter (Haiku) |
| Buchmacher-Quoten | The Odds API | niedrig | TTL 8 h, Stopp nach Finale (Quota-Schutz, ~138 Credits gesamt) |
| Accuracy/Modell-Vergleich/Gewichte | abgeleitet | — | fällt bei jedem Lauf aus Ergebnissen + Tipps ab |

Wichtig: **Auch `news`-Läufe aktualisieren Ergebnisse** (voller Datenlauf,
nur ohne KI-Tipps) — jeder gelaufene Job bringt also frische Resultate.

## Taktung — wer stößt was an

Der **Cloudflare-Worker** (`infra/cron-worker/`) ist der primäre Taktgeber:
sein Cron ist exakt und wird — anders als GitHub-`schedule` — nicht
gedrosselt. Er feuert `repository_dispatch` (`event_type: refresh-data`,
`mode: predict`) an `refresh.yml`.

- **Cron:** `3 4-21 * * *` (UTC) → **stündlich um :03, 06:03–23:03 deutscher
  Zeit**. Nachts (0–6 Uhr dt. Zeit) bewusst keine Anstöße.
- **Monats-Guard** im Worker-Code begrenzt zusätzlich auf Juni/Juli
  (Cloudflares Schedules-API akzeptiert keine Monats-Felder im Cron).
- **GitHub-`schedule`** ist als zusätzlicher Best-effort-Fallback nur noch
  für `news` und `predict-daily` aktiv; der frühere `predict-hourly`-Cron
  ist **abgeschaltet** (vermied die 4-fache Redundanz pro Stunde).

## Jobs (GitHub Actions)

| Workflow | Trigger | Aufgabe |
|---|---|---|
| `refresh` | **`repository_dispatch`** (Cloudflare) / manuell | Primärer predict-Lauf: Tipps für fällige Partien + Ergebnisse |
| `predict-daily` | Cron `23 5 * * *` | Backstop: voller predict-Lauf |
| `predict-hourly` | nur noch `workflow_dispatch` (Cron aus) | manueller predict-Lauf bei Bedarf |
| `news` | Cron `11 */3 * * *` | News + Ergebnisse (ohne KI) |
| `ci` | Push/PR (Code) | Typecheck + Tests + Format |
| `_alert` | `failure()` der Daten-Jobs | GitHub-Issue `pipeline-failure` (dedupliziert) |

## Kosten-Kontrolle der KI-Calls

Jeder KI-Tipp = 1 Claude- + 1 ChatGPT-Call. Mehrere Stellschrauben begrenzen
die Anzahl drastisch (eine teure Partie wurde anfangs 46× neu bewertet —
behoben):

1. **KI-Fenster 36 h** (`WM_AI_WINDOW_HOURS`, Default 36): Nur Partien mit
   Anpfiff in ≤ 36 h werden überhaupt bewertet. Weiter entfernte Spiele
   kosten nichts (ihr Tipp ändert sich ohnehin kaum).
2. **Retrigger-Logik** (`predict/retrigger.ts`) — ein Spiel im Fenster wird
   nur neu bewertet, wenn:
   - noch kein KI-Tipp existiert (Erstbewertung), **oder**
   - sich der Feature-Hash ändert (echtes neues Ergebnis/Daten), **oder**
   - eine **neue** materielle News (Verletzung/Sperre/Trainer) *nach* dem
     letzten Tipp erschien — nicht jede tagelang im Feed stehende
     Schlagzeile (das war der frühere Kostentreiber), **oder**
   - ein **Zeit-Milestone** überschritten wird: **T-24 h** und **T-4 h**.
   → Pro Spiel typisch ~3–4 Bewertungen über die gesamte Laufzeit
   (Erst-Tipp + 2 Milestones + ggf. echte News) statt einer pro Lauf.
3. **Batches-API:** Ab 3 fälligen Partien bündelt Claude über die
   Message-Batches-API → **−50 %** auf die Claude-Calls.
4. **Modell:** `claude-opus-4-8` ($5/$25 pro MTok) statt des teureren
   Fable 5 ($10/$50) — bewusste Kosten-Entscheidung (`config.ts`).
5. **Odds-Quota:** TTL 8 h + Stopp nach dem Finale.

> Frequenz erhöhen heißt **nicht** automatisch mehr Kosten: Läufe, in denen
> kein Spiel einen Milestone überschreitet und keine neue News vorliegt,
> verursachen **null** KI-Calls. Die Taktung muss nur fein genug sein, um die
> Milestones (T-24/4 h) zeitnah zu treffen — der Stundentakt genügt dafür.

## Schutzmechanismen

1. **Job-Timeouts** (15–25 min): Ein hängender Lauf kann die
   `data-pipeline`-Concurrency-Gruppe nicht stundenlang blockieren.
2. **Sanity-Guard** (`buildData`): unplausible Quelldaten (< 40 Teams,
   < 70 Spiele) brechen den Lauf ab, statt `/data` zu überschreiben.
3. **Git-Race-Schutz**: `git pull --rebase -X theirs` — Konflikte in
   generierten Daten lösen sich zugunsten des neueren Stands.
4. **Failure-Alert**: jedes rote Pipeline-Ergebnis erzeugt/kommentiert ein
   Issue → GitHub-Benachrichtigung.
5. **Frische-Banner in der App**: Datenstand > 3 h alt → sichtbarer Hinweis
   (stilles Veralten fällt sofort auf).

## Cloudflare-Worker — Setup & Wartung

Code & Config liegen versioniert in `infra/cron-worker/`
(`worker.mjs`, `wrangler.jsonc`). Deploy aus diesem Verzeichnis:

```sh
npx wrangler deploy                 # Worker + Cron-Trigger ausrollen
npx wrangler secret put GITHUB_PAT  # Token setzen (interaktiv, nie im Code)
npx wrangler tail                   # Live-Logs (Dispatch-Status)
```

**`GITHUB_PAT`**: fine-grained PAT, nur dieses Repo, Permission
**Contents: Read & Write** (für `repository_dispatch` nötig), Ablauf
31.07.2026 (nach dem Finale — kein Verlängerungsbedarf). Liegt ausschließlich
als verschlüsseltes Worker-Secret vor.

**Takt ändern:** `crons` in `wrangler.jsonc` anpassen + `wrangler deploy`.
Das Juni/Juli-Fenster steckt im Worker-Code (Monats-Guard), nicht im Cron.

### Soforthilfe (jederzeit, ungedrosselt)

```sh
gh workflow run refresh.yml -f mode=predict   # sofortiger predict-Lauf
```

## Troubleshooting

| Symptom | Prüfen | Ursache/Behebung |
|---|---|---|
| Ergebnisse fehlen | openfootball-Quelle MIT Cache-Buster: `curl ".../worldcup.json?t=$(date +%s)"` | CDN/Cache stale; Lauf anstoßen |
| Tipps veraltet | `gh run list` — kamen Dispatch-Läufe? `wrangler tail` | Worker-Cron/Secret prüfen; Soforthilfe nutzen |
| KI-Kosten zu hoch | `predictionHistory`-Länge je Match (sollte einstellig sein) | Retrigger-Leck? Fenster/Milestones in `config.ts` enger stellen |
| Lauf rot | Issue `pipeline-failure` + `gh run view <id> --log-failed` | je nach Log; Daten bleiben beim letzten guten Stand |
| App zeigt alte Daten | Frische-Banner? Versions-Footer? | 60-s-Poll + NetworkFirst holen automatisch; einmal neu laden |

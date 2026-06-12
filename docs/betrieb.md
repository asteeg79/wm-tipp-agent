# Betriebskonzept — WM-Tipp-Assistent 2026

Stand: 12.06.2026 (WM läuft). Dieses Dokument beschreibt alle automatischen
Jobs, ihre Aufgaben, Frequenzen und Schutzmechanismen — und wie man die
Daten-Frische im Turnierbetrieb sicherstellt.

## Datenarten & Aktualitätsbedarf

| Datenart | Quelle | Zeitkritik | Mechanismus |
|---|---|---|---|
| Ergebnisse + Spielplan | openfootball `worldcup.json` | **hoch** (Spieltage) | jeder Pipeline-Lauf, Cache-TTL 10 min |
| KI-Tipps (Claude Fable 5 + ChatGPT) | Anthropic/OpenAI | mittel (Milestones T-72/24/3 h) | `predict`-Läufe; Retrigger-Logik; Claude via Batches-API |
| News je Team | Google News RSS + kicker/Sportschau/… | niedrig (Stunden) | `news`-Läufe alle 3 h; KI-Relevanzfilter (Haiku) |
| Buchmacher-Quoten | The Odds API | niedrig | TTL 8 h, Stopp nach Finale (Quota-Schutz, ~138 Credits gesamt) |
| Accuracy/Modell-Vergleich/Gewichte | abgeleitet | — | fällt bei jedem Lauf aus Ergebnissen + Tipps ab |

Wichtig: **Auch `news`-Läufe aktualisieren Ergebnisse** (voller Datenlauf,
nur ohne KI-Tipps) — jeder gelaufene Job bringt also frische Resultate.

## Jobs (GitHub Actions)

| Workflow | Trigger | Aufgabe |
|---|---|---|
| `predict-hourly` | Cron `17,47 * * 6,7 *` | Tipps für fällige Partien (Milestones/News/Datenänderung) + Ergebnisse |
| `predict-daily` | Cron `23 5 * * *` | Backstop: voller predict-Lauf (72-h-Fenster) |
| `news` | Cron `11 */3 * * *` | News + Ergebnisse (ohne KI) |
| `refresh` | manuell / **`repository_dispatch`** | beliebiger Modus; externer Taktgeber-Anschluss |
| `ci` | Push/PR (Code) | Typecheck + 95 Tests + Format |
| `_alert` | `failure()` der Daten-Jobs | GitHub-Issue `pipeline-failure` (dedupliziert) |

## Schutzmechanismen

1. **Job-Timeouts** (15–25 min): Ein hängender Lauf kann die
   `data-pipeline`-Concurrency-Gruppe nicht mehr stundenlang blockieren.
2. **Sanity-Guard** (`buildData`): unplausible Quelldaten (< 40 Teams,
   < 70 Spiele) brechen den Lauf ab, statt `/data` zu überschreiben.
3. **Git-Race-Schutz**: `git pull --rebase -X theirs` — Konflikte in
   generierten Daten lösen sich zugunsten des neueren Stands.
4. **Failure-Alert**: jedes rote Pipeline-Ergebnis erzeugt/kommentiert ein
   Issue → GitHub-Benachrichtigung.
5. **Frische-Banner in der App**: Datenstand > 3 h alt → sichtbarer Hinweis
   (stilles Veralten fällt sofort auf).
6. **Kosten-Gates**: KI nur im 72-h-Fenster + Retrigger-Milestones; Claude
   gebündelt über die Batches-API (−50 %); Odds-Quota-TTL + Enddatum.

## Bekanntes Risiko: GitHub-Cron-Drosselung

GitHub behandelt `schedule` als *best effort*. Beobachtung (11.–12.06.):
unabhängig von der Anzahl Cron-Slots wurden für dieses **private** Repo nur
**~5–6 Schedule-Läufe pro Tag und Workflow** zugestellt (Lücken bis 5 h).
Krumme Minuten und mehr Slots erhöhen den Durchsatz NICHT zuverlässig.

**Nicht gedrosselt** sind dagegen `workflow_dispatch` und
`repository_dispatch`. Daraus folgen die beiden Lösungswege:

### Option A (empfohlen): Externer Taktgeber → `repository_dispatch`

Ein Cloudflare Worker (kostenlos, Cron-Trigger sind dort exakt) stößt die
Pipeline an. `refresh.yml` hat den Anschluss bereits (`event_type:
refresh-data`).

1. **Fine-grained PAT erstellen** (github.com → Settings → Developer
   settings): nur dieses Repo, Permission **Contents: Read & Write**
   *(für repository_dispatch nötig)*. Ablauf z. B. 31.07.2026.
2. **Worker anlegen** (dash.cloudflare.com → Workers & Pages → Create):

   ```js
   export default {
     async scheduled(event, env) {
       await fetch(
         "https://api.github.com/repos/asteeg79/wm-tipp-agent/dispatches",
         {
           method: "POST",
           headers: {
             Authorization: `Bearer ${env.GITHUB_PAT}`,
             Accept: "application/vnd.github+json",
             "User-Agent": "wm-tipp-cron",
           },
           body: JSON.stringify({
             event_type: "refresh-data",
             client_payload: { mode: "predict" },
           }),
         },
       );
     },
   };
   ```

3. **Secret setzen**: Worker → Settings → Variables → `GITHUB_PAT`
   (Encrypt). *Den PAT nie im Chat oder Code ablegen.*
4. **Cron-Trigger**: Worker → Settings → Triggers → Cron, z. B.
   `*/30 12-23,0-6 * 6,7 *` (alle 30 min während der Spielzeit-Stunden UTC,
   nur Juni/Juli). Die GitHub-Crons bleiben als Fallback aktiv;
   doppelte Läufe serialisiert die Concurrency-Gruppe, KI-Kosten entstehen
   nur für fällige Partien.

**Hinweis Actions-Minuten (privates Repo, Free-Tier 2 000 min/Monat):**
alle 30 min × ~4 min Laufzeit ≈ 3 800 min/Monat → über dem Free-Limit.
Entweder Taktung auf 45–60 min strecken, das Repo **public** machen
(unbegrenzte Minuten, bessere Cron-Priorität) oder Billing aktivieren.

### Option B: Repo public machen

Public Repos haben unbegrenzte Actions-Minuten und erfahrungsgemäß
zuverlässigere Schedule-Zustellung. Voraussetzung: keine lizenzierten
Inhalte im Repo (GS-Zahlen sind ohnehin ausgeschlossen), Keys liegen nur
in GitHub Secrets. Entscheidung liegt beim Betreiber.

### Soforthilfe (jederzeit)

```sh
gh workflow run refresh.yml -f mode=predict   # ungedrosselter Sofort-Lauf
```

## Troubleshooting

| Symptom | Prüfen | Ursache/Behebung |
|---|---|---|
| Ergebnisse fehlen | openfootball-Quelle MIT Cache-Buster: `curl ".../worldcup.json?t=$(date +%s)"` | CDN/Cache stale; Lauf anstoßen |
| Tipps veraltet | `gh run list` — kamen Läufe? | Cron-Drosselung → Soforthilfe/Option A |
| Lauf rot | Issue `pipeline-failure` + `gh run view <id> --log-failed` | je nach Log; Daten bleiben beim letzten guten Stand |
| App zeigt alte Daten | Frische-Banner? Versions-Footer? | 60-s-Poll + NetworkFirst holen automatisch; einmal neu laden |

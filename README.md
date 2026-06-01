# WM-Tipp-Assistent 2026 ⚽

Eine PWA, die für die **FIFA WM 2026** (11.06.–19.07.2026, 48 Teams) für jede
Partie einen **begründeten Ergebnistipp** abgibt. Tipps basieren auf aktueller
Form, gewichteter Historie der letzten 2 Jahre, relevanten News und weiteren
Faktoren und werden von einem **KI-Ensemble (Claude + ChatGPT)** bewertet.

> **Kein Wettanbieter.** Die App gibt keine Wett- oder Finanzberatung. Tipps
> ohne Gewähr.

## Architektur

Statische PWA (gehostet auf **Vercel**), „Backend" via **GitHub Actions**:

- **`/pipeline`** (Node/TS) — holt Daten (openfootball, kein Key), News (RSS),
  rechnet Features, ruft Claude + ChatGPT, schreibt `/data/*.json`, committet
  ins Repo.
- **`/app`** (React PWA, Vite) — lädt nur statische JSON-Dateien. Kein API-Key,
  kein externer Fetch im Browser (außer Flaggen-CDN).
- **`/shared`** — gemeinsame **zod-Schemas** für Pipeline (schreibt) und App
  (liest) → garantierte Konsistenz.
- **`/data`** — generierte, von der Pipeline committete JSONs.

Alle KI-Schlüssel-Nutzung passiert **ausschließlich** in Actions. Die Keys
liegen nur als GitHub Secrets vor und kommen nie ins Frontend-Bundle.

> **Wie kommt der Tipp zustande?** Die gesamte Bewertungsberechnung
> (Elo + Poisson-Baseline → KI-Ensemble Claude + ChatGPT → Reconciliation) und
> der Fundort der Prompts sind in [`docs/ki-bewertung.md`](docs/ki-bewertung.md)
> ausführlich beschrieben.
>
> **Woher kommen die News?** Frequenz, Quellen (kicker, Sportschau, n-tv,
> Spiegel, BBC, Guardian, ESPN, Sky + Google-News pro Team), Filterung,
> Dedupe, Impact-Tagging und Speicherung sind in
> [`docs/news-pipeline.md`](docs/news-pipeline.md) beschrieben.

## Voraussetzungen

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)

## Lokaler Dev-Start

```bash
pnpm install

# App im Dev-Modus (Vite)
pnpm dev

# Typecheck über alle Pakete
pnpm typecheck

# Pipeline manuell ausführen (liest .env)
pnpm pipeline
```

Für die Pipeline lokal eine `.env` aus `.env.example` anlegen und die Keys
eintragen (siehe unten). Die echte `.env` ist in `.gitignore`.

## Benötigte Secrets

Auf GitHub unter **Settings → Secrets and variables → Actions** hinterlegen
(lokal in `.env`):

| Secret | Zweck | Pflicht |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (KI-Ensemble) | ab Phase 5 |
| `OPENAI_API_KEY` | ChatGPT (KI-Ensemble) | ab Phase 5 |
| `API_FOOTBALL_KEY` | API-Football (Ergebnisse/Spielplan) | ab Phase 1 |
| `ODDS_API_KEY` | The Odds API (Value-vs-Markt) | optional |
| `BALLDONTLIE_API_KEY` | BALLDONTLIE FIFA WC API | optional |

## Hosting auf Vercel (empfohlen — gratis auch für private Repos)

Vercel hostet die statische PWA und funktioniert — anders als GitHub Pages —
auch bei privaten Repos kostenlos. Die App läuft dann an der Domain-Root (`/`).

**Einrichtung (einmalig, Git-Integration):**

1. Im **Vercel-Dashboard** das Projekt öffnen (`prj_0jd7RqxzDnCKP3UjGbl6cAL43MqP`).
2. **Settings → Git → Connect Git Repository** → `asteeg79/wm-tipp-agent`
   (Branch `main`) verbinden.
3. Build-Settings kommen aus [`vercel.json`](vercel.json) im Repo-Root
   (Install/Build-Command, Output `app/dist`, SPA-Rewrites). Nichts manuell
   einzustellen.
4. Deploy auslösen. Danach deployt Vercel **automatisch bei jedem Push** auf
   `main` — auch bei den Bot-Commits der Daten-Pipeline (`refresh.yml`), d. h.
   neue Tipps gehen ohne Zutun live.

> Der Build kopiert `/data` via [`scripts/stage-data.mjs`](scripts/stage-data.mjs)
> nach `app/public/data`, sodass die App `/data/*.json` vom selben Origin lädt.
> Vercel setzt automatisch `VERCEL=1` → der Vite-`base` ist dort `/`.
> KI-Keys werden für das Hosting **nicht** benötigt (die App liest nur fertige
> JSONs; die Keys leben ausschließlich in den GitHub-Actions-Secrets).

## GitHub Pages (Alternative)

> **Wichtig:** GitHub Pages ist bei **privaten** Repos nur mit einem
> Bezahl-Plan (Pro/Team) verfügbar. Dieses Repo ist privat → der Pages-Deploy
> ist deshalb deaktiviert (`deploy.yml` nur per `workflow_dispatch`).

**Um die App live zu hosten, eine der beiden Optionen:**

- **Repo öffentlich machen** (Pages dann gratis): in `deploy.yml` den
  `push`-Trigger wieder einkommentieren und in `configure-pages`
  `enablement: true` setzen. ⚠️ Vorher den alten `API_FOOTBALL_KEY`
  (in der Git-Historie) im api-sports.io-Dashboard deaktivieren.
- **GitHub Pro** für das private Repo, dann analog Pages aktivieren.

Danach: **Settings → Pages → Source: GitHub Actions** (bzw. automatisch via
`enablement: true`). Die Seite erscheint unter
`https://<user>.github.io/<repo-name>/`.

> Der Vite-`base`-Path und der Router-Basename werden automatisch auf
> `/<repo-name>/` gesetzt (über `VITE_REPO_NAME`, im Deploy-Workflow aus dem
> Repo-Namen). Lokal läuft die App unter `/` (`pnpm dev`).

## Pipeline auf GitHub starten

**Actions → „Data Refresh (Pipeline)" → Run workflow** (`workflow_dispatch`)
oder automatisch per Cron (täglich 04:00 UTC, im Turnierfenster Juni/Juli
alle 3 h). Die Pipeline committet aktualisierte `/data` ins Repo. Benötigt die
Secrets `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` (für das KI-Ensemble; ohne sie
läuft sie graceful nur mit der Baseline).

## Phasenplan

Der Aufbau folgt dem Phasenplan aus `WM-Tipp-App_Spezifikation.md` (Abschnitt
18). Aktueller Stand: **Phase 0 — Setup & Gerüst** abgeschlossen.

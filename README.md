# WM-Tipp-Assistent 2026 ⚽

Eine PWA, die für die **FIFA WM 2026** (11.06.–19.07.2026, 48 Teams) für jede
Partie einen **begründeten Ergebnistipp** abgibt. Tipps basieren auf aktueller
Form, gewichteter Historie der letzten 2 Jahre, relevanten News und weiteren
Faktoren und werden von einem **KI-Ensemble (Claude + ChatGPT)** bewertet.

> **Kein Wettanbieter.** Die App gibt keine Wett- oder Finanzberatung. Tipps
> ohne Gewähr.

## Architektur

Statische PWA auf **GitHub Pages**, „Backend" via **GitHub Actions**:

- **`/pipeline`** (Node/TS) — holt Daten (API-Football), News (RSS), rechnet
  Features, ruft Claude + ChatGPT, schreibt `/data/*.json`, committet ins Repo.
- **`/app`** (React PWA, Vite) — lädt nur statische JSON-Dateien. Kein API-Key,
  kein externer Fetch im Browser.
- **`/shared`** — gemeinsame **zod-Schemas** für Pipeline (schreibt) und App
  (liest) → garantierte Konsistenz.
- **`/data`** — generierte, von der Pipeline committete JSONs.

Alle Schlüssel-Nutzung passiert **ausschließlich** in Actions. API-Keys liegen
nur als GitHub Secrets vor und kommen nie ins Frontend-Bundle.

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

## GitHub Pages aktivieren

1. Repo zu GitHub pushen (Branch `main`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Beim nächsten Push auf `main` baut `deploy.yml` die App und deployt sie.
   Die Seite erscheint unter `https://<user>.github.io/<repo-name>/`.

> Der Vite-`base`-Path und der Router-Basename werden automatisch auf
> `/<repo-name>/` gesetzt (über `VITE_REPO_NAME`, im Deploy-Workflow aus dem
> Repo-Namen). Lokal läuft die App unter `/`.

## Pipeline manuell auf GitHub starten

**Actions → „Data Refresh (Pipeline)" → Run workflow** (`workflow_dispatch`).
Der automatische Cron-Zeitplan folgt in Phase 6.

## Phasenplan

Der Aufbau folgt dem Phasenplan aus `WM-Tipp-App_Spezifikation.md` (Abschnitt
18). Aktueller Stand: **Phase 0 — Setup & Gerüst** abgeschlossen.

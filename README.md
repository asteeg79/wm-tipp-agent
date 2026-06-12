# WM-Tipp-Assistent 2026 ⚽

Eine Progressive Web App, die für jede Partie der **FIFA WM 2026**
(11.06.–19.07.2026, 48 Teams, 104 Spiele) einen **begründeten Ergebnistipp**
abgibt — berechnet aus Elo-Ratings, gewichteter Form, Buchmacher-Quoten und
team-spezifischen News, bewertet von einem **KI-Ensemble** (Claude + ChatGPT)
und fortlaufend an den echten Ergebnissen gemessen.

> **Kein Wettanbieter.** Die App gibt keine Wett- oder Finanzberatung.
> Tipps ohne Gewähr.

## Funktionen

- **Spiele-Dashboard** — alle Partien mit Tipp, Konfidenz und (sobald
  gespielt) echtem Ergebnis; Live-Countdown zum nächsten Anpfiff.
- **Gruppen** — Tabellen inkl. simulierten Weiterkommens-Wahrscheinlichkeiten
  (Monte-Carlo aus den Match-Wahrscheinlichkeiten, echte Resultate fließen ein).
- **K.-o.-Baum & Titelchancen** — kompletter Turnierbaum (Sechzehntel- bis
  Finale); sobald echte K.-o.-Paarungen feststehen, ersetzt der reale Baum
  die Elo-Projektion.
- **Teams** — Profil je Nation: Form, Historie, H2H, Elo, kuratierte News mit
  Impact-Tags (Verletzung/Sperre/Trainer).
- **Bilanz** — Trefferquoten (Tendenz/exakt), Brier- und RPS-Scores, plus
  **Claude-vs.-ChatGPT-Vergleich** mit den aktuellen Ensemble-Gewichten.
- **PWA** — installierbar, offlinefähig, Dark/Light, Deutsch/Englisch,
  automatische Daten- und Versions-Aktualisierung.

## Architektur

Statische PWA + Daten-Pipeline — es gibt **keinen laufenden Server**:

```
openfootball ─┐                       GitHub Actions (Cron + Dispatch)
Google News ──┤   ┌────────────────────────────────────────────────┐
kicker u. a. ─┼──▶│  /pipeline  (Node/TS)                          │
The Odds API ─┘   │  Features → Baseline → KI-Ensemble → Reconcile │
                  └──────────────┬─────────────────────────────────┘
                                 │ committet /data/*.json (zod-validiert)
                                 ▼
                          GitHub Repo (main)
                                 │ Push-Trigger
                                 ▼
                       Vercel (statisches Hosting)
                                 │
                                 ▼
                   /app  (React-PWA, lädt nur JSON)
```

- **`/pipeline`** (Node/TS) — lädt Spielplan/Ergebnisse (openfootball,
  gemeinfrei), Historie, News (RSS) und Quoten; berechnet Features und Tipps;
  schreibt `/data/*.json` und committet sie ins Repo.
- **`/app`** (React + Vite + Tailwind) — liest ausschließlich die statischen
  JSONs vom eigenen Origin. Kein API-Key im Browser, kein externer Fetch
  (außer Flaggen-CDN).
- **`/shared`** — gemeinsame **zod-Schemas**: die Pipeline validiert beim
  Schreiben, die App beim Lesen → garantiert konsistente Datenverträge.
- **`/data`** — generierte JSONs (Index, Teams, Matches, Prognose-Index).
  Wird ausschließlich von der CI geschrieben.

Alle API-Keys existieren nur als **GitHub Secrets** und werden ausschließlich
in Actions benutzt; sie erreichen nie das Frontend-Bundle.

## Prognose-System

Der Tipp entsteht in drei Stufen (Details: [`docs/ki-bewertung.md`](docs/ki-bewertung.md)):

1. **Deterministische Baseline** — Elo-Ratings (aus 2 Jahren
   Länderspiel-Historie, FIFA-Seed) + Poisson-Modell über erwartete Tore,
   moduliert durch gewichtete Form, Angriffs-/Abwehr-Momentum,
   Konföderations-/Mentalitätsfaktoren und Stadionhöhe.
2. **KI-Ensemble** — Claude (`claude-fable-5`, Structured Outputs + adaptives
   Denken, gebündelt über die Message-Batches-API) und ChatGPT (`gpt-4o`)
   bewerten jede Partie unabhängig: Wahrscheinlichkeiten, Ergebnistipp,
   Konfidenz, Schlüsselfaktoren, Risiken. Als Anker erhalten sie die Baseline,
   kuratierte News beider Teams und — falls verfügbar — entzerrte
   Buchmacher-Wahrscheinlichkeiten (De-vig-Median).
3. **Reconciliation** — konfidenz- und **treffsicherheits-gewichtete**
   Mischung beider Modelle (das nachweislich bessere Modell erhält mehr
   Gewicht, gemessen am laufenden RPS über beendete Spiele), Konsens- und
   Knapp-Rennen-Regeln für den finalen Ergebnistipp, regelbasierte Begründung.

**Kosten-Steuerung:** KI-Bewertungen nur im 72-h-Fenster vor Anpfiff und nur
bei Bedarf (Re-Trigger-Milestones T-72/24/3 h, geänderte Eingangsdaten oder
materielle News); unveränderte Partien verursachen keine Modell-Calls.

## Qualitätsmessung

Nach jedem Spiel werden Tendenz-/Exakt-Treffer, **Brier-Score** und **Ranked
Probability Score** berechnet — für den finalen Tipp und für jedes Modell
einzeln. Daraus speisen sich die Bilanz-Seite und die automatische
Ensemble-Gewichtung (mit Mindeststichprobe, Glättung und Clamp, damit kein
Modell vorschnell dominiert oder stummgeschaltet wird).

## News-Pipeline

Pro Team werden Google-News-Suchen (Deutsch mit deutschem Ländernamen +
Englisch) und kuratierte Feeds (kicker, Sportschau, n-tv, Spiegel, BBC)
aggregiert, dedupliziert und von `claude-haiku-4-5` auf echte Relevanz für die
Männer-Nationalmannschaft gefiltert; eine Heuristik vergibt Impact-Tags
(Verletzung/Sperre/Trainer). Details: [`docs/news-pipeline.md`](docs/news-pipeline.md).

## Betrieb (Jobs)

| Workflow | Trigger | Aufgabe |
|---|---|---|
| `predict-hourly` | Cron 4×/h (Jun/Jul) | Tipps für fällige Partien + Ergebnisse |
| `predict-daily` | Cron täglich | Backstop: voller Predict-Lauf (72-h-Fenster) |
| `news` | Cron alle 2 h | News + Ergebnisse (ohne KI) |
| `refresh` | manuell / `repository_dispatch` | beliebiger Modus, externer Taktgeber |
| `ci` | Push/PR | Typecheck, Tests, Format |
| `_alert` | bei Fehlschlag | GitHub-Issue `pipeline-failure` |

Schutzmechanismen (Job-Timeouts, Sanity-Guard gegen kaputte Quelldaten,
Git-Race-Auflösung, Frische-Banner in der App) und Troubleshooting:
[`docs/betrieb.md`](docs/betrieb.md).

## Entwicklung

Voraussetzungen: Node.js ≥ 20, pnpm ≥ 9.

```bash
pnpm install
pnpm dev          # App (Vite-Dev-Server)
pnpm typecheck    # alle Pakete
pnpm test         # Vitest-Suite (deterministischer Kern)
pnpm lint         # ESLint
pnpm pipeline     # Daten-Pipeline lokal (liest .env)
```

Pipeline-Modi: `WM_MODE=news` (ohne KI), `predict` (KI im 72-h-Fenster,
Default), `full` (KI für alle Partien). Lokal `.env` aus `.env.example`
anlegen — die echte `.env` ist gitignored.

### Secrets (GitHub → Settings → Secrets → Actions)

| Secret | Zweck | Pflicht |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude: KI-Tipps + News-Relevanzfilter | für KI-Tipps |
| `OPENAI_API_KEY` | ChatGPT (zweites Ensemble-Modell) | für KI-Tipps |
| `ODDS_API_KEY` | The Odds API (Markt-Anker) | optional |

Ohne KI-Keys läuft die Pipeline graceful mit der deterministischen Baseline.

## Hosting

Vercel baut bei jedem Push auf `main` (auch bei den Daten-Commits der
Pipeline) — Konfiguration liegt in [`vercel.json`](vercel.json), `/data` wird
beim Build zur App gestaged. Die produktive Instanz ist über Cloudflare
Access geschützt.

## Dokumentation

- [`docs/architecture.md`](docs/architecture.md) — Module, Datenfluss, Teststrategie
- [`docs/ki-bewertung.md`](docs/ki-bewertung.md) — Bewertungslogik im Detail
- [`docs/news-pipeline.md`](docs/news-pipeline.md) — Quellen, Filterung, Tagging
- [`docs/betrieb.md`](docs/betrieb.md) — Betriebskonzept, Frische, Troubleshooting

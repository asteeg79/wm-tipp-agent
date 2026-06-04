# Architektur — WM-Tipp-Assistent 2026

Diese Datei beschreibt den Aufbau der Anwendung: die Module („Services"), den
Datenfluss, Hosting/Automatisierung und die Teststrategie. Sie ergänzt
[`ki-bewertung.md`](./ki-bewertung.md) (Tipp-Berechnung im Detail) und
[`news-pipeline.md`](./news-pipeline.md).

## 1 · Designphilosophie

- **Serverlos & statisch.** Es gibt **keinen laufenden Backend-Server**. Die
  gesamte Logik läuft als **Build-/Cron-Pipeline** (GitHub Actions), schreibt
  fertige JSON-Dateien nach `/data` und **Vercel liefert sie statisch** aus.
  Vorteile: kostenlos, keine Ops, kein Skalierungsaufwand, robust.
- **Eine Quelle der Wahrheit pro Schema.** `@wm/shared` definiert alle
  zod-Schemas; Pipeline (schreibt) und App (liest) teilen sie → keine
  Format-Drift.
- **Deterministisch zuerst, KI korrigiert.** Eine reproduzierbare
  Elo+Poisson-Baseline liefert Zahlen; das KI-Ensemble passt sie begründet an.
- **Kostenkontrolle eingebaut.** KI- und Quoten-Aufrufe sind durch Modi,
  Zeitfenster und Caches budgetiert.

> **Warum keine Netzwerk-Microservices?** Eigenständig deploybare HTTP-Dienste
> bräuchten laufende Server (Kosten, Orchestrierung, Monitoring) und würden das
> serverlose Modell brechen — ohne Nutzen bei diesem Lastprofil (ein Turnier,
> periodische Batch-Läufe). Stattdessen ist die Pipeline als **modulare,
> einzweck-orientierte Services** im Monorepo organisiert: kleine Dateien mit
> klarer Verantwortung und schmalen Schnittstellen. Das liefert die Vorteile
> (Trennung, Testbarkeit, Austauschbarkeit) ohne den Infrastruktur-Overhead.

## 2 · Monorepo

pnpm-Workspace mit drei Paketen:

| Paket | Rolle |
|---|---|
| `@wm/shared` | zod-Schemas + abgeleitete Typen (Vertrag zwischen Pipeline & App) |
| `@wm/pipeline` | Daten-/Prognose-Pipeline (Node/TS, läuft in CI) |
| `@wm/app` | React-PWA (Vite + Tailwind), liest `/data`, läuft im Browser |

`/data` (committete JSON-Artefakte) ist die Brücke: Pipeline schreibt, App liest.

## 3 · Pipeline-Services

Jeder Ordner unter `pipeline/src/` bündelt einzweck-Services:

### `sources/` — Datenbeschaffung (austauschbare Adapter)
| Service | Verantwortung |
|---|---|
| `openFootball.ts` | Turnierstruktur/Spielplan (worldcup.json) |
| `openFootballHistory.ts` | Länderspiel-Historie (internationals, Football.TXT) |
| `footballTxt.ts` | Parser für das Football.TXT-Format |
| `newsFeeds.ts` / `rss.ts` | RSS/Atom-News je Team |
| `oddsApi.ts` | Buchmacher-Quoten (The Odds API) → de-vig-1X2 |
| `externalPriors.ts` | optionaler generischer Fremdprognose-Prior (lokal) |
| `countries.ts` | Name↔FIFA-Code↔Flagge |
| `http.ts` | HTTP-Client mit Backoff (429/5xx) |
| `types.ts` | Provider-Interfaces (Tournament/History) |

### `features/` — Berechnung (reine Funktionen, voll getestet)
| Service | Verantwortung |
|---|---|
| `elo.ts` | World-Football-Elo (Erwartung, Update, Seeding-Hook) |
| `eloSeed.ts` | FIFA-Ranking-Näherung als Start-Elo |
| `form.ts` | Zeit-decay-gewichtete Form + asymmetrisches Momentum |
| `poisson.ts` | λ-Schätzung (Elo+Form+Faktoren) + Score-Matrix → 1X2 |
| `confederation.ts` | UEFA-/Top-Nation-Zuordnung (GS-Faktoren) |
| `engine.ts` | orchestriert Form+Elo+Poisson → FeatureBundle + Baseline |
| `accuracy.ts` | Trefferquoten, Brier, RPS + Aggregat (nach Spielende) |
| `opponents.ts` | mögliche WM-Gegner / H2H-Markierung |
| `impactTag.ts` | News-Impact-Heuristik (injury/suspension/coach/morale) |
| `news.ts` | News-Aggregation pro Team |

### `predict/` — KI-Ensemble
| Service | Verantwortung |
|---|---|
| `prompt.ts` | System-Prompt + Bau der User-Message |
| `models.ts` | Claude- & ChatGPT-Clients (API, JSON-Extraktion, Retry) |
| `schema.ts` | zod-Schema der LLM-Antwort + `normalizeProbs` |
| `reconcile.ts` | Zusammenführung beider Modelle → finaler Tipp |
| `retrigger.ts` | Entscheidung, **ob** neu bewertet wird (Kosten-Gate) |
| `index.ts` | Orchestrierung (`makeEnsemble`, parallele Calls) |

### `io/` — Persistenz
`cache.ts` (Datei-Cache mit TTL), `json.ts` (zod-validiertes Lesen/Schreiben),
`paths.ts` (zentrale Pfade).

### Einstieg & Werkzeuge
`index.ts` (Modus-Auflösung news/predict/full, .env-Laden), `buildData.ts`
(Gesamt-Orchestrierung), `backtest/` (Walk-Forward-Validierung der Engine).

## 4 · Datenfluss (ein Lauf)

```
GitHub Actions (Cron)
  └─ pipeline (WM_MODE=news|predict|full)
       1. sources: Spielplan + Historie (+ News, + Quoten)   [gecacht]
       2. features/elo: globales Elo aus Historie (+ Seed)
       3. je Team: features/form → Team-JSON (Elo, Form, News, H2H)
       4. je Match: features/engine → FeatureBundle + Baseline
            └─ predict (nur im Anpfiff-Fenster & bei Bedarf):
                 models → schema → reconcile → finaler Tipp
       5. accuracy: Metriken für beendete Partien
       6. schreibt /data/*.json  →  git commit (Bot)
  └─ Vercel: Auto-Deploy → /data statisch ausgeliefert
       └─ App (PWA): TanStack Query lädt /data, rendert Tipps
```

## 5 · App (PWA)

React + Vite + Tailwind, semantisches Token-System (Light/Dark), i18n DE/EN,
Service-Worker (offline-fähig, Update-Banner). Daten kommen ausschließlich aus
statischem `/data` (kein clientseitiger API-/Key-Zugriff). Seiten: Übersicht
(Scorebug), Gruppen, Teams, Match-Detail (Tipp, Modell-Vergleich, Markt,
Tipp-Verlauf), Bracket, Bilanz, Vergleich, Admin.

## 6 · Automatisierung & Hosting

| Workflow | Takt | Zweck |
|---|---|---|
| `news.yml` | alle 3 h | Struktur/Historie/News/Quoten, **keine KI** |
| `predict-daily.yml` | täglich | KI für Partien im 72-h-Fenster |
| `predict-hourly.yml` | stündlich (Jun/Jul) | Re-Trigger ~3 h vor Anpfiff |
| `refresh.yml` | manuell | Modus wählbar (news/predict/**full**) |
| `deploy.yml` | manuell | (GitHub-Pages-Alternative, inaktiv) |

Secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ODDS_API_KEY`) liegen **nur**
als GitHub-Secrets bzw. lokal in `.env` (gitignored) — **nie im Repo**.
Hosting: **Vercel** (Git-Integration, Auto-Deploy bei Push/Bot-Commit).

## 7 · Teststrategie

Vitest deckt den **deterministischen Kern** ab — die korrektheitskritische,
isolierbare Logik (siehe `vitest.config.ts`):

- `shared` Schemas (100 %), `features` (Elo/Form/Poisson/Engine/Accuracy/
  Confederation/ImpactTag), `predict` (Reconcile inkl. Regressionstests,
  Schema), `sources` reine Teile (Odds-De-vig, Football.TXT-Parser).
- **Bewusst ausgenommen:** Netzwerk-/KI-Adapter (`http`, `models`,
  `openFootball*`, `newsFeeds`) und das React-UI — dort liefern Unit-Tests
  wenig Korrektheitsnutzen (Integration/IO, gemockte Calls, Markup).

Befehle: `pnpm test`, `pnpm test:watch`, `pnpm coverage`. Tests liegen in
`<paket>/tests/` (außerhalb `src/`), damit `pnpm -r typecheck` (Produktion)
unberührt bleibt.

## 8 · Konventionen

- **Idempotenz:** Match-Re-Bewertung über `inputHash` (kein KI-Call ohne echte
  Änderung). News-/Historien-/Quoten-Caches mit TTL begrenzen externe Aufrufe.
- **Graceful Degradation:** fehlende Keys/Quellen → Feature inaktiv statt
  Absturz (z. B. ohne `ODDS_API_KEY` keine Quoten, ohne KI-Key nur Baseline).
- **Versionierung:** CalVer aus Commit-Zeitstempel (`gen-version.mjs`),
  shallow-clone-fest.

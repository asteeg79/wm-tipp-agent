# Wie die KI-Bewertung funktioniert

Dieses Dokument beschreibt die gesamte Tipp-Berechnung — von den Rohdaten bis
zum finalen Ergebnis — und sagt, **wo die Prompts liegen**.

## Wo die Prompts stehen

Beide Prompts stehen in [`pipeline/src/predict/prompt.ts`](../pipeline/src/predict/prompt.ts):

- **System-Prompt** (Rolle/Regeln, für beide Modelle identisch): Konstante
  `SYSTEM_PROMPT`.
- **User-Message** (die konkreten Spieldaten als JSON): Funktion
  `buildUserMessage()`.

Alle Dateien des KI-Teils liegen in `pipeline/src/predict/`:

| Datei | Aufgabe |
|---|---|
| `prompt.ts` | System-Prompt + Bau der User-Message |
| `schema.ts` | zod-Schema der erwarteten LLM-Antwort + `normalizeProbs` |
| `models.ts` | Claude- & ChatGPT-Clients (API-Call, JSON-Extraktion, 1× Retry) |
| `reconcile.ts` | Zusammenführung beider Modelle zum finalen Tipp |
| `retrigger.ts` | Entscheidung, **ob** überhaupt neu bewertet wird |
| `index.ts` | Orchestrierung (`makeEnsemble`, parallele Calls) |

## Grundprinzip: Mathematik liefert die Zahlen, die KI korrigiert sie

LLMs sind schwach in Arithmetik/Kalibrierung, aber stark im Kontext. Deshalb:

1. Eine **deterministische Baseline** (Elo + Poisson) berechnet zuerst harte
   Wahrscheinlichkeiten.
2. Beide KI-Modelle bekommen diese Baseline **mitgeliefert** und dürfen sie nur
   **begründet anpassen** — keine Zahlen „erfinden".
3. Ein deterministischer **Reconciliation**-Schritt verschmilzt die beiden
   Modell-Antworten wieder zu einem Tipp.

Ablauf in einem Satz:
**Feature-Bundle + Baseline → (Claude ‖ ChatGPT) → Reconciliation → finaler Tipp.**

## Schritt A — Feature-Bundle & Baseline (vor der KI)

Erzeugt in `pipeline/src/features/`, bevor ein LLM aufgerufen wird:

- **Elo-Rating** (`elo.ts`): aus allen Länderspielen der letzten 2 Jahre,
  chronologisch.
  - Erwartung `E_home = 1 / (1 + 10^((Elo_away − Elo_home)/400))`
  - Update nach jedem Spiel `Elo' = Elo + K · G · (Ergebnis − E)`, K = 40,
    G = Tordifferenz-Multiplikator (1 / 1,5 / höher bei klaren Siegen).
- **Form mit Zeit-Decay** (`form.ts`): Gewicht je Spiel `w = 0,5^(Δt/H)`,
  Halbwertszeit H = 180 Tage; Spiele gegen mögliche WM-Gegner zusätzlich ×
  α = 1,5. Ergebnis: gewichtete Punkte/Spiel, Tore-für/-gegen, Clean-Sheet-Rate.
- **Poisson-Baseline** (`poisson.ts`): aus Elo-Differenz + Angriffs-/Abwehr-Form
  erwartete Tore λ_home, λ_away (inkl. Heimvorteil für Gastgeber). Die volle
  Score-Matrix wird zu 1X2-Wahrscheinlichkeiten + wahrscheinlichstem Ergebnis
  (innerhalb des Top-Ausgangs) aggregiert.

Resultat: `featureBundle` + `baseline` pro Match — genau das geht in den Prompt.

## Schritt B — Der Prompt

- **System-Prompt** (fix): Rolle „erfahrener Fußball-Analyst WM 2026", Kernregel
  „Erfinde KEINE Statistiken; nutze nur die gelieferten Daten", und erzwingt
  reines JSON in diesem Schema:
  ```json
  { "predictedScore": {"home":int,"away":int},
    "probabilities": {"home":float,"draw":float,"away":float},
    "confidence": float,
    "keyFactors": [string],
    "risks": [string] }
  ```
- **User-Message**: deterministisch serialisiertes JSON mit
  - `baseline` (1X2 + erwartete Tore),
  - `features.home` / `features.away` (Elo, gewichtete Form, Tore-Schnitte,
    Clean-Sheet-Rate, Tage seit letztem Spiel),
  - `features.h2h` (direkte Duelle),
  - `features.context` (neutraler Platz, Höhe z. B. Mexico City 2240 m,
    Gastgeber-Vorteil),
  - `materialNews` (nur News mit Impact-Tag ≠ `none`).

Beide Modelle bekommen **exakt dasselbe** Bundle.

## Schritt C — Die Modell-Aufrufe (`models.ts`)

`makeEnsemble()` ruft die verfügbaren Clients **parallel** (`Promise.allSettled`)
— fällt ein Modell aus, bricht der Tipp nicht ab. Jeder Client: ruft sein Modell
(Claude `claude-opus-4-8`, ChatGPT `gpt-4o`; Namen in `config.ts`), extrahiert
das JSON (Claude antwortet teils in ```json-Fences), validiert gegen das
zod-Schema; bei ungültigem JSON **genau ein Retry** mit Korrektur-Hinweis.

## Schritt D — Reconciliation (`reconcile.ts`)

Die zwei Antworten werden zu einem Tipp verrechnet:

1. **Finale Wahrscheinlichkeiten — konfidenz-gewichteter Mittelwert:**
   ```
   w_i = max(0,01; confidence_i)
   p_final = Σ(w_i · p_i) / Σ(w_i)   für home/draw/away,  danach renormiert
   ```
2. **agreement (Einigkeit):**
   ```
   MAD = (|p1.home−p2.home| + |p1.draw−p2.draw| + |p1.away−p2.away|) / 3
   agreement = 1 − MAD        (0…1; bei nur einem Modell = 1)
   ```
3. **Finale Konfidenz — bei Uneinigkeit gedämpft:**
   ```
   meanConf   = Mittel der Modell-Konfidenzen
   confidence = meanConf · (0,5 + 0,5 · agreement)
   ```
4. **Finaler Score:** vom Modell mit höherer Konfidenz, via `makeConsistent()`
   konsistent zum wahrscheinlichsten 1X2-Ausgang gemacht.
5. **rationale:** regelbasierte Prosa aus den vereinten `keyFactors` + Hinweis,
   ob die Modelle einig/uneinig waren.

**Sonderfälle:** Ein Modell → dessen Werte (agreement = 1). Kein Modell
(kein Key) → Baseline unverändert als Tipp (graceful degradation).

## Schritt E — Re-Trigger: wann überhaupt bewertet wird (`retrigger.ts`)

Neu bewertet wird nur bei mindestens einer Bedingung:

- noch kein KI-Tipp vorhanden,
- geänderter `inputHash` (neues Ergebnis/neue Daten),
- materielle News (Impact-Tag ≠ none),
- Zeit-Milestone T-72h / T-24h / T-3h vor Anpfiff.

Sonst wird übersprungen (Kostenschutz). Bei Neubewertung wandert der alte Tipp
in `predictionHistory` → die Timeline im Match-Detail.

## Zahlenbeispiel (Mexico–South Africa, echter Lauf)

```
Baseline (Elo+Poisson):  Heim 50% / Remis 26% / Auswärts 24%

Claude:   2:1   53/26/21%   confidence 0,58
ChatGPT:  1:1   45/32/23%   confidence 0,70

Reconciliation:
  konf.-gew. Mittel → ~48/29/23%
  agreement = 1 − MAD ≈ 0,95
  confidence = mean(0,58;0,70) · (0,5+0,5·0,95) ≈ 0,63
  Score: konfidenteres Modell (1:1), aber Top-Ausgang Heim → konsistent zu 2:1
Finaler Tipp: 2:1, 48/29/23%, Konfidenz 63%
```

## Was gespeichert wird

In `data/matches/<id>.json` unter `prediction` liegen transparent: `baseline`,
beide Einzelmodelle (`models.claude`, `models.chatgpt`), `agreement`, der finale
`predictedScore`/`probabilities`/`confidence`, die `rationale` und der
`inputHash`. Jeder Tipp ist damit nachvollziehbar und (über Git) versioniert.

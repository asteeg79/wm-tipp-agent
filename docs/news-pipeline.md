# News-Pipeline: Frequenz, Quellen, Verarbeitung, Speicherung

Wie die App an die Team-News kommt — vollständig **serverseitig** in der
Pipeline (GitHub Actions), nie im Browser (kein CORS, kein Key im Frontend).

## Frequenz — wann News gezogen werden

News werden serverseitig geholt, nicht beim Seitenaufruf. Die Jobs sind nach
**Kosten** getrennt (News sind günstig, KI-Calls nicht):

| Workflow | Cron | Modus | KI? |
|---|---|---|---|
| `news.yml` | alle 3 h (`0 */3 * * *`) | `news` | nein |
| `predict-daily.yml` | täglich 05:00 (`0 5 * * *`) | `predict` | ja, Anpfiff ≤ 72 h |
| `predict-hourly.yml` | stündlich Jun/Jul (`0 * * 6,7 *`) | `predict` | ja, nur fällige (T-3h) |
| `refresh.yml` | manuell | wählbar (Default `full`) | je nach Modus |

**Pipeline-Modi** (`WM_MODE` bzw. `--mode`):
- `news`: nur News + Struktur, **keine KI** (günstig, mehrmals täglich).
- `predict`: News + KI, aber **nur Partien mit Anpfiff ≤ `WM_AI_WINDOW_HOURS`
  (Default 72 h)**. Die Re-Trigger-Logik (T-72/24/3h, `inputHash`, materielle
  News) sorgt dafür, dass im stündlichen Lauf nur wirklich fällige Partien
  einen KI-Call auslösen — insbesondere ~3 h vor Anpfiff.
- `full`: KI für alle Partien ohne Fenster (teuer, nur manuell).

So wird jede Partie i. d. R. **einmal täglich** (im 72h-Fenster) und **erneut
~3 h vor Anpfiff** mit den aktuellsten Infos getippt, während News mehrfach
täglich frisch gezogen werden.

Zusätzlich **Feed-Cache mit 1 h TTL** je Feed-URL
([`features/news.ts`](../pipeline/src/features/news.ts), `FEED_TTL_MS`): Läufe
binnen einer Stunde holen die Feeds aus dem Cache statt erneut vom Netz (schont
Bandbreite bei ~100 Feed-Abrufen für 48 Teams).

## Quellen — was geholt wird

Definiert in [`sources/newsFeeds.ts`](../pipeline/src/sources/newsFeeds.ts).

**Globale Feeds** (einmal pro Lauf, dann je Team gefiltert) — bewusst auf die
**wichtigsten** Quellen reduziert, mit Schwerpunkt **deutschsprachig**:
- Deutsch: kicker (WM + Fußball), Sportschau WM 2026, n-tv Fußball, Spiegel
  Fußball
- International (Rückfallquelle): BBC Sport

**Pro-Team-Feeds** — Google-News-RSS-Suche je Team in **DE + EN**:
- `news.google.com/rss/search?q="<Team>"+(Nationalmannschaft OR Fußball OR WM)&hl=de`
- `…q="<Team>"+(national team OR World Cup)&hl=en-US`

Die Google-News-Suche ist der universelle Hebel: auch kleine Verbände bekommen
relevante Schlagzeilen, ohne dedizierten Feed.

**Sprach-Priorisierung:** Jeder Feed ist mit `lang` (`de`/`en`) markiert. Die
Aggregation sortiert **deutschsprachige News zuerst** (`compareNews`), danach je
Sprache die neuesten zuerst — so füllen deutsche Treffer die Liste vorrangig,
englische nur die Restplätze (für Teams mit wenig deutscher Berichterstattung).

**Abruf** ([`sources/rss.ts`](../pipeline/src/sources/rss.ts)): RSS/Atom via
`fast-xml-parser`, fehlertolerant (ein toter Feed bricht den Lauf nicht ab) mit
Backoff. Bei Google-News wird die echte Medienquelle aus dem Titel-Suffix
("… - RND.de") geparst statt "news.google.com".

## Verarbeitung — pro Team (`NewsAggregator.forTeam`)

1. **Sammeln:** die zwei Google-News-Feeds des Teams (jetzt **fußballstrikt**:
   der Teamname wird mit einer Pflicht-Fußballbegriffsgruppe UND-verknüpft, plus
   Negativ-Keywords gegen andere Sportarten → kein „Tour de France" mehr) + die
   globalen Feeds.
2. **Filtern** (nur globale Feeds): Item behalten nur bei **wortgenauem**
   Treffer des **vollständigen** Teamnamens (Diakritika-tolerant). Verhindert
   Substring-Fehltreffer (z. B. „Mali" in „Somalia").
3. **Deduplizieren:** nach normalisierter **URL** (ohne Query/Hash) **und**
   normalisiertem **Titel** — fängt identische Links und Cross-Postings.
4. **Impact-Tagging** ([`features/impactTag.ts`](../pipeline/src/features/impactTag.ts)):
   Schlüsselwort-Heuristik (DE+EN), erste Übereinstimmung gewinnt, Reihenfolge =
   Priorität:
   - `injury` (verletzt, angeschlagen, muskelfaser, reha, fraglich, doubtful,
     hamstring, ruled out, comeback …)
   - `suspension` (gesperrt, gelb-rot, rote karte, banned, sent off …)
   - `coach` (trainer, kader, nominiert, aufstellung, squad, call-up, line-up …)
   - `morale` (streit, krise, unruhe, momentum, confidence, controversy …)
   - sonst `none`
5. **Sortieren** (deutschsprachig bevorzugt, dann neueste) und auf max. 30
   Kandidaten kappen.
6. **KI-Relevanzfilter** (optional, [`predict/newsRelevance.ts`](../pipeline/src/predict/newsRelevance.ts)):
   **genau ein** Call pro Team an ein günstiges Modell (`gpt-4o-mini`) mit allen
   Kandidaten-Titeln; das Modell gibt die Indizes der wirklich relevanten
   Schlagzeilen zurück (Männer-Nationalelf, Fußballkontext). Entfernt
   Themenfremdes, das die Heuristik durchlässt (z. B. „Terror in Paris"). Wird
   **per Inhalts-Hash gecacht** (12 h) → unveränderte Kandidaten lösen keinen
   neuen Call aus; bei Fehler bleibt die Eingabe erhalten. Deaktivierbar via
   `WM_NO_NEWS_AI=1`; ohne `OPENAI_API_KEY` inaktiv. Danach auf
   **`config.maxNewsPerTeam` = 20** kürzen.

> Hinweis: Das Tagging ist eine Heuristik; der KI-Relevanzfilter (Schritt 6) und
> die finale **KI-Bewertung** (siehe [`ki-bewertung.md`](ki-bewertung.md)) — deren
> System-Prompt jetzt auch eigene, zu 100 % relevante News der KI zulässt —
> sorgen für die feine Relevanz.

## Speicherung — wo und in welcher Form

Pro Team in `data/teams/<teamId>.json`, Feld `news[]`, je Item:

```json
{ "title": "...", "source": "The Guardian", "url": "https://...",
  "publishedAt": "2026-05-30T...", "snippet": "...", "impactTag": "injury" }
```

**Kein Volltext** (Urheberrecht) — nur Titel, kurzer Snippet, Quelle, Link,
Tag. Die JSONs werden von der Pipeline ins Git committet (versioniert) und über
Vercel ausgeliefert; die App liest sie direkt.

## Weiterverwendung

1. **Anzeige:** Team-Detail zeigt die News-Liste mit Quelle/Datum/Link/Badge.
2. **KI-Bewertung:** Nur **materielle** News (`impactTag ≠ none`, max. 6/Team)
   fließen in den Prompt (`newsLines()` in `predict/prompt.ts`).
3. **Re-Trigger:** Eine neue materielle News stößt eine Neubewertung des Tipps
   an ([`predict/retrigger.ts`](../pipeline/src/predict/retrigger.ts)) → der
   Tipp verändert sich bei relevanten Nachrichten bis kurz vor Anpfiff.

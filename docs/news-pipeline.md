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

**Globale Feeds** (einmal pro Lauf, dann je Team gefiltert):
- Deutsch: kicker (WM + Fußball), Sportschau (Fußball + WM 2026), n-tv (Sport +
  Fußball), Spiegel Fußball
- International: BBC Sport, The Guardian, ESPN, Sky Sports

**Pro-Team-Feeds** — Google-News-RSS-Suche je Team in **DE + EN**:
- `news.google.com/rss/search?q="<Team>"+(Nationalmannschaft OR Fußball OR WM)&hl=de`
- `…q="<Team>"+(national team OR World Cup)&hl=en-US`

Die Google-News-Suche ist der universelle Hebel: auch kleine Verbände bekommen
relevante Schlagzeilen, ohne dedizierten Feed.

**Abruf** ([`sources/rss.ts`](../pipeline/src/sources/rss.ts)): RSS/Atom via
`fast-xml-parser`, fehlertolerant (ein toter Feed bricht den Lauf nicht ab) mit
Backoff. Bei Google-News wird die echte Medienquelle aus dem Titel-Suffix
("… - RND.de") geparst statt "news.google.com".

## Verarbeitung — pro Team (`NewsAggregator.forTeam`)

1. **Sammeln:** die zwei Google-News-Feeds des Teams + die globalen Feeds.
2. **Filtern** (nur globale Feeds): Item behalten, wenn Titel/Snippet den
   Teamnamen oder ein **Alias** enthält (voller Name + signifikante Wörter ab
   4 Buchstaben ohne Stoppwörter wie "Republic/North/South").
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
5. **Sortieren** (neueste zuerst) und auf **`config.maxNewsPerTeam` = 20**
   kürzen.

> Hinweis: Das Tagging ist eine Heuristik und kann mehrdeutige Schlagzeilen
> falsch einordnen. Es ist nur der grobe Vorfilter — die **KI** bewertet die
> Materialität in Phase 5 feiner (siehe [`ki-bewertung.md`](ki-bewertung.md)).

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

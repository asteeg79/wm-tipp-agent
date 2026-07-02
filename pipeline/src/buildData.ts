/**
 * Phase-1-Orchestrierung (Hybrid): Struktur/Spielplan aus dem
 * TournamentProvider (openfootball) + Historie aus dem HistoryProvider
 * (API-Football). Schreibt index.json, teams/<id>.json und matches/<id>.json
 * (zod-validiert, inkrementell, budget-bewusst).
 */
import {
  IndexFile,
  Match,
  PredictionsIndex,
  Team,
  type AccuracyEntry,
  type NewsItem,
  type PotentialOpponent,
  type Prediction,
  type PredictionIndexEntry,
  type ScoreLine,
  type Stage,
  type TeamResult,
  type TeamSummary,
} from "@wm/shared";
import { config } from "../config.js";
import { confidenceFromProbs, round } from "./util/math.js";
import { writeJson } from "./io/json.js";
import {
  indexPath,
  matchPath,
  predictionsIndexPath,
  teamPath,
} from "./io/paths.js";
import { readProgress, writeProgress, type Progress } from "./io/cache.js";
import type {
  HistoryMatch,
  HistoryProvider,
  NormalizedFixture,
  TournamentProvider,
} from "./sources/types.js";
import { computeH2h, deriveOpponentSets } from "./features/opponents.js";
import { NewsAggregator } from "./features/news.js";
import { makeNewsRelevanceFilter } from "./predict/newsRelevance.js";
import {
  computeEloRatings,
  gamesFromHistories,
  type EloGame,
} from "./features/elo.js";
import { ELO_SEED } from "./features/eloSeed.js";
import { runEngine, featureHash } from "./features/engine.js";
import {
  computeForm,
  recencyWeight as recencyWeightFor,
} from "./features/form.js";
import {
  makeEnsemble,
  type Ensemble,
  type EvaluateInput,
} from "./predict/index.js";
import type {
  GroupContext,
  GroupStandingRow,
  RecentResult,
} from "./predict/prompt.js";
import {
  computeModelComparison,
  computeModelWeights,
  type FinishedWithModels,
} from "./predict/ensembleWeights.js";
import { decideRetrigger } from "./predict/retrigger.js";
import {
  loadExternalPriors,
  type ExternalPriors,
} from "./sources/externalPriors.js";
import {
  isPlausibleMarket,
  loadOdds,
  oddsKey,
  swapMarket,
} from "./sources/oddsApi.js";
import type { MarketOdds } from "@wm/shared";
import { readJsonOptional } from "./io/json.js";
import { aggregateAccuracy, scoreMatch } from "./features/accuracy.js";

export interface BuildStats {
  teamsTotal: number;
  teamsWritten: number;
  teamsFailed: number;
  matchesWritten: number;
  historyLoaded: number;
  newsLoaded: number;
  aiEvaluated: number;
  aiSkipped: number;
  accuracyScored: number;
}

export interface BuildOptions {
  /** News (RSS) holen und in teams/*.json schreiben. */
  withNews: boolean;
  /** KI-Ensemble für anstehende Partien ausführen (Phase 5). */
  withAi: boolean;
  /**
   * KI nur für Partien mit Anpfiff innerhalb dieses Fensters (Stunden ab jetzt)
   * bewerten — Kostensteuerung. null/undefined = kein Fenster-Limit.
   * Spiele außerhalb behalten ihren letzten Tipp (oder Baseline).
   */
  aiWindowHours?: number | null;
  /**
   * Erzwingt die Neubewertung ALLER Partien im Anpfiff-Fenster (umgeht die
   * Retrigger-Logik). Für manuelle „jetzt alles neu rechnen"-Läufe. Das Fenster
   * (aiWindowHours) begrenzt weiterhin, WELCHE Partien betroffen sind.
   */
  forceEval?: boolean;
}

/** Saisons für die N-Jahres-Historie (eindeutige Jahre im Zeitfenster). */
function historySeasons(now: Date, years: number): number[] {
  const envOverride = process.env.WM_HISTORY_SEASONS;
  if (envOverride) {
    return envOverride
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
  }
  const endYear = now.getUTCFullYear();
  const startYear = new Date(
    Date.UTC(endYear - years, now.getUTCMonth(), now.getUTCDate()),
  ).getUTCFullYear();
  const seasons: number[] = [];
  for (let y = startYear; y <= endYear; y++) seasons.push(y);
  return seasons;
}

/** Wandelt die Historie eines Teams in TeamResult[] um. */
function toTeamResults(
  history: HistoryMatch[],
  potentialIds: Set<string>,
): TeamResult[] {
  return history.map((m) => ({
    matchId: m.matchId,
    date: m.date,
    competition: m.competition,
    home: m.home,
    opponentId: m.opponentId,
    opponentName: m.opponentName,
    goalsFor: m.goalsFor,
    goalsAgainst: m.goalsAgainst,
    venue: m.neutral ? "neutral" : m.home ? "home" : "away",
    isVsPotentialWcOpponent: potentialIds.has(m.opponentId),
  }));
}

/** Sammelt Historie + TeamResult[] aller Teams (Fehler → teamsFailed, skip). */
async function collectHistories(
  teams: TeamSummary[],
  seasons: number[],
  historyProvider: HistoryProvider,
  opponentSets: ReturnType<typeof deriveOpponentSets>,
  stats: BuildStats,
): Promise<{
  historyByTeam: Map<string, HistoryMatch[]>;
  resultsByTeam: Map<string, TeamResult[]>;
}> {
  const historyByTeam = new Map<string, HistoryMatch[]>();
  const resultsByTeam = new Map<string, TeamResult[]>();
  for (const team of teams) {
    try {
      const history = await historyProvider.getTeamHistory(team, seasons);
      stats.historyLoaded += history.length;
      historyByTeam.set(team.id, history);
      const potentialIds = new Set(
        (opponentSets.get(team.id) ?? []).map((r) => r.teamId),
      );
      resultsByTeam.set(team.id, toTeamResults(history, potentialIds));
    } catch (err) {
      stats.teamsFailed++;
      console.warn(`[pipeline] Historie ${team.id} übersprungen:`, err);
    }
  }
  return { historyByTeam, resultsByTeam };
}

/**
 * Ein beendetes WM-Spiel aus Sicht eines Teams in dessen Results anhängen
 * (idempotent). `fx.goalsHome/Away` sind vom Aufrufer als non-null garantiert.
 */
function pushWcFormResult(
  list: TeamResult[],
  fx: NormalizedFixture,
  home: boolean,
  nameById: Map<string, string>,
): void {
  if (list.some((r) => r.matchId === fx.matchId)) return; // idempotent
  const oppId = home ? fx.awayTeamId : fx.homeTeamId;
  list.push({
    matchId: fx.matchId,
    date: fx.date,
    competition: "FIFA World Cup 2026",
    home,
    opponentId: oppId,
    opponentName: nameById.get(oppId) ?? oppId,
    goalsFor: home ? fx.goalsHome! : fx.goalsAway!,
    goalsAgainst: home ? fx.goalsAway! : fx.goalsHome!,
    venue: fx.neutral ? "neutral" : home ? "home" : "away",
    isVsPotentialWcOpponent: true, // echter WM-Gegner → voll gewichtet
  });
}

/**
 * Bereits gespielte WM-Partien (aktuellste Daten, dem History-Provider
 * unbekannt) in Form/Results beider Teams einspeisen (idempotent) und als
 * EloGame[] für die Elo-Berechnung zurückgeben.
 */
function injectFinishedWcMatches(
  schedule: NormalizedFixture[],
  resultsByTeam: Map<string, TeamResult[]>,
  nameById: Map<string, string>,
): EloGame[] {
  const wcEloGames: EloGame[] = [];
  for (const fx of schedule) {
    if (!fx.finished || fx.goalsHome === null || fx.goalsAway === null)
      continue;
    wcEloGames.push({
      date: fx.date,
      homeId: fx.homeTeamId,
      awayId: fx.awayTeamId,
      homeGoals: fx.goalsHome,
      awayGoals: fx.goalsAway,
      neutral: fx.neutral,
    });
    for (const home of [true, false]) {
      const list = resultsByTeam.get(home ? fx.homeTeamId : fx.awayTeamId);
      if (list) pushWcFormResult(list, fx, home, nameById);
    }
  }
  return wcEloGames;
}

interface WriteTeamsCtx {
  teams: TeamSummary[];
  resultsByTeam: Map<string, TeamResult[]>;
  opponentSets: ReturnType<typeof deriveOpponentSets>;
  historyByTeam: Map<string, HistoryMatch[]>;
  newsByTeam: Map<string, NewsItem[]>;
  eloOf: (id: string) => number;
  nowIso: string;
  progress: Progress;
  stats: BuildStats;
  newsAggregator: NewsAggregator | null;
  newsFilter: ReturnType<typeof makeNewsRelevanceFilter> | null;
}

/** Schreibt die Team-Dokumente (Form + News + mögliche Gegner). */
async function writeTeams(c: WriteTeamsCtx): Promise<void> {
  for (const team of c.teams) {
    const results = c.resultsByTeam.get(team.id);
    if (!results) continue; // Historie fehlgeschlagen
    try {
      const refs = c.opponentSets.get(team.id) ?? [];
      const potentialOpponents: PotentialOpponent[] = refs.map((r) => ({
        teamId: r.teamId,
        stage: r.stage,
        h2hSummary: computeH2h(r.teamId, c.historyByTeam.get(team.id) ?? []),
      }));

      let news: NewsItem[] = [];
      if (c.newsAggregator) {
        try {
          news = await c.newsAggregator.forTeam(
            team,
            c.newsFilter ?? undefined,
          );
          c.stats.newsLoaded += news.length;
        } catch (err) {
          console.warn(`[pipeline] News für ${team.id} fehlgeschlagen:`, err);
        }
      }
      c.newsByTeam.set(team.id, news);

      await writeJson(
        teamPath(team.id),
        Team,
        buildTeam(
          team,
          c.nowIso,
          results,
          potentialOpponents,
          news,
          c.eloOf(team.id),
        ),
      );
      c.progress.teamsBackfilled[team.id] = c.nowIso;
      c.stats.teamsWritten++;
    } catch (err) {
      c.stats.teamsFailed++;
      console.warn(`[pipeline] Team ${team.id} übersprungen:`, err);
    }
  }
}

/**
 * SANITY-GUARD: Liefert die Quelle offensichtlich kaputte Daten (Teilausfall,
 * leeres JSON, Format-Bruch), abbrechen statt den letzten guten /data-Stand zu
 * überschreiben. (WM 2026: 48 Teams, 104 Spiele; Schwellen bewusst mit Luft.)
 */
function assertPlausibleSource(
  teams: TeamSummary[],
  schedule: NormalizedFixture[],
): void {
  if (teams.length < 40 || schedule.length < 70) {
    throw new Error(
      `[pipeline] Quelldaten unplausibel (teams=${teams.length}, ` +
        `matches=${schedule.length}) — Lauf abgebrochen, /data bleibt unverändert`,
    );
  }
}

/** Stunden bis zum nächsten Anpfiff (null = kein anstehendes Spiel). */
function minHoursToNextKickoff(
  schedule: NormalizedFixture[],
  now: Date,
): number | null {
  const upcoming = schedule
    .filter((fx) => !fx.finished && fx.dateTime)
    .map(
      (fx) => (new Date(fx.dateTime!).getTime() - now.getTime()) / MS_PER_HOUR,
    )
    .filter((h) => h >= 0);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

/** Loggt den KI-Ensemble-Status (aktiv oder auf Baseline degradiert). */
function logEnsembleStatus(ensemble: Ensemble | null): void {
  if (ensemble && !ensemble.active) {
    console.warn(
      "[pipeline] Kein KI-Key gesetzt → nur Baseline (graceful degradation).",
    );
  } else if (ensemble) {
    console.log(
      `[pipeline] KI-Ensemble aktiv: ${ensemble.modelIds.join(", ")}`,
    );
  }
}

export async function buildData(
  tournamentProvider: TournamentProvider,
  historyProvider: HistoryProvider,
  options: BuildOptions = { withNews: true, withAi: true },
): Promise<BuildStats> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Turnierstruktur + Spielplan laden + Sanity-Guard (bei kaputter Quelle
  // abbrechen, statt den letzten guten /data-Stand zu überschreiben).
  const { tournament, groups, teams, rankByTeamId } =
    await tournamentProvider.getTournament();
  const schedule = await tournamentProvider.getSchedule();
  assertPlausibleSource(teams, schedule);

  await writeJson(indexPath, IndexFile, {
    tournament,
    lastUpdated: nowIso,
    groups,
    teams,
  });

  // 2) Mögliche Gegner ableiten
  const opponentSets = deriveOpponentSets(teams, groups, rankByTeamId);

  const seasons = historySeasons(now, config.historyYears);
  const progress = await readProgress();
  const maxTeams = process.env.WM_MAX_TEAMS
    ? Number(process.env.WM_MAX_TEAMS)
    : Infinity;

  const stats: BuildStats = {
    teamsTotal: teams.length,
    teamsWritten: 0,
    teamsFailed: 0,
    matchesWritten: 0,
    historyLoaded: 0,
    newsLoaded: 0,
    aiEvaluated: 0,
    aiSkipped: 0,
    accuracyScored: 0,
  };

  // 4) Historie aller Teams sammeln (für globale Elo-Berechnung).
  const newsByTeam = new Map<string, NewsItem[]>();
  const nameById = new Map<string, string>();
  for (const t of teams) nameById.set(t.id, t.name);
  const limitedTeams = Number.isFinite(maxTeams)
    ? teams.slice(0, maxTeams)
    : teams;

  const { historyByTeam, resultsByTeam } = await collectHistories(
    limitedTeams,
    seasons,
    historyProvider,
    opponentSets,
    stats,
  );

  // 4b) Bereits gespielte WM-Partien sind die AKTUELLSTEN Daten — der
  // History-Provider (openfootball internationals) kennt sie nicht. Daher hier
  // in Elo UND Form/Results beider Teams einspeisen (recency-gewichtet wirken
  // sie automatisch am stärksten). Quelle: schedule (worldcup.json).
  const wcEloGames = injectFinishedWcMatches(schedule, resultsByTeam, nameById);

  // 5) Globale Elo-Ratings aus Historie + bereits gespielten WM-Partien.
  const eloRatings = computeEloRatings([
    ...gamesFromHistories(historyByTeam),
    ...wcEloGames,
  ]);
  // Fallback für Teams ganz ohne Historie: Seed, sonst config.elo.initial.
  const eloOf = (id: string): number =>
    eloRatings.get(id) ?? ELO_SEED[id] ?? config.elo.initial;

  // index.json mit Elo anreichern (Enabler für die Elo-basierte K.-o.-Sim im
  // Client). Überschreibt den frühen Schreibvorgang aus Schritt 1.
  await writeJson(indexPath, IndexFile, {
    tournament,
    lastUpdated: nowIso,
    groups,
    teams: teams.map((t) => ({ ...t, elo: Math.round(eloOf(t.id)) })),
  });

  // 6) Teams schreiben (inkl. Form + News).
  const newsAggregator = options.withNews ? new NewsAggregator() : null;
  // KI-Relevanzfilter (1 Call/Team, günstiges Modell, gecacht) — nur wenn ein
  // Anthropic-Key vorhanden ist und nicht via WM_NO_NEWS_AI deaktiviert.
  const newsFilter =
    options.withNews && process.env.WM_NO_NEWS_AI !== "1"
      ? makeNewsRelevanceFilter(process.env.ANTHROPIC_API_KEY)
      : null;
  if (newsFilter) console.log("[pipeline] KI-News-Relevanzfilter aktiv");
  await writeTeams({
    teams: limitedTeams,
    resultsByTeam,
    opponentSets,
    historyByTeam,
    newsByTeam,
    eloOf,
    nowIso,
    progress,
    stats,
    newsAggregator,
    newsFilter,
  });

  // 7) Matches mit Engine (Feature-Bundle + Baseline) + optional KI-Ensemble.
  const ensemble = options.withAi ? makeEnsemble() : null;
  logEnsembleStatus(ensemble);

  const externalPriors = loadExternalPriors();
  if (externalPriors) {
    console.log(
      `[pipeline] Externe Priors geladen (${externalPriors.source}): ${externalPriors.byMatch.size} Partien`,
    );
  }

  // Buchmacher-Quoten (optional; nur mit ODDS_API_KEY, gecacht). Stunden bis
  // zum nächsten Anpfiff bestimmen die Cache-TTL: nahe am Anpfiff frischer.
  const odds = await loadOdds(minHoursToNextKickoff(schedule, now));
  if (odds.size > 0) {
    console.log(`[pipeline] Buchmacher-Quoten geladen: ${odds.size} Partien`);
  }

  const matchResult = await writeMatches(schedule, {
    resultsByTeam,
    newsByTeam,
    nameById,
    eloOf,
    now,
    ensemble: ensemble && ensemble.active ? ensemble : null,
    aiWindowHours: options.aiWindowHours ?? null,
    forceEval: options.forceEval ?? false,
    externalPriors,
    odds,
  });
  stats.matchesWritten = matchResult.written;
  stats.aiEvaluated = matchResult.aiEvaluated;
  stats.aiSkipped = matchResult.aiSkipped;

  // 8) predictions-index.json inkl. Accuracy nach Spielende.
  stats.accuracyScored = await writePredictionsIndex(
    matchResult.matches,
    nowIso,
  );

  await persistProgress(progress);
  return stats;
}

interface WriteMatchesCtx {
  resultsByTeam: Map<string, TeamResult[]>;
  newsByTeam: Map<string, NewsItem[]>;
  nameById: Map<string, string>;
  eloOf: (id: string) => number;
  now: Date;
  ensemble: Ensemble | null;
  /** KI nur für Partien ≤ diesem Anpfiff-Fenster (Std.); null = unbegrenzt. */
  aiWindowHours: number | null;
  /** Retrigger umgehen → alle Partien im Fenster neu bewerten (manueller Lauf). */
  forceEval: boolean;
  /** Optionale externe Prognose-Priors (als Anker für die KI). */
  externalPriors: ExternalPriors | null;
  /** Buchmacher-Quoten je Partie (gekeyt über oddsKey(home, away)). */
  odds: Map<string, MarketOdds>;
}

interface WriteMatchesResult {
  written: number;
  aiEvaluated: number;
  aiSkipped: number;
  /** Alle geschriebenen Matches (für predictions-index + Accuracy). */
  matches: Match[];
}

/**
 * Sammelt aus den BEENDETEN Partien die gespeicherten Einzelmodell-Tipps
 * (prediction.models) samt Ist-Ergebnis und berechnet daraus die
 * Accuracy-Gewichte. Liest nur Match-Dateien beendeter Partien.
 */
async function collectModelWeights(
  schedule: NormalizedFixture[],
): Promise<ReturnType<typeof computeModelWeights>> {
  const finished: FinishedWithModels[] = [];
  for (const fx of schedule) {
    if (!fx.finished || fx.goalsHome === null || fx.goalsAway === null) {
      continue;
    }
    const prev = await readJsonOptional<Match>(matchPath(fx.matchId), Match);
    if (!prev?.prediction?.models) continue;
    finished.push({
      actualResult: { home: fx.goalsHome, away: fx.goalsAway },
      models: prev.prediction.models,
    });
  }
  return computeModelWeights(finished, config.ensemble.accuracyMinSample);
}

interface GroupTable {
  rows: GroupStandingRow[];
  /** teamId → bereits gespielte Gruppenspiele (für den Spieltag). */
  played: Map<string, number>;
}

/**
 * Aktuelle Gruppentabellen aus den bereits gespielten Gruppenspielen des
 * Spielplans. Jede Gruppe enthält ALLE ihre Teams (auch mit 0 Spielen), damit
 * der Stand schon am 1. Spieltag mitgegeben werden kann.
 */
function computeGroupTables(
  schedule: NormalizedFixture[],
  nameById: Map<string, string>,
): Map<string, GroupTable> {
  interface Agg {
    played: number;
    pts: number;
    gf: number;
    ga: number;
  }
  const byGroup = new Map<string, Map<string, Agg>>();
  const ensure = (g: string, id: string): Agg => {
    if (!byGroup.has(g)) byGroup.set(g, new Map());
    const tbl = byGroup.get(g)!;
    if (!tbl.has(id)) tbl.set(id, { played: 0, pts: 0, gf: 0, ga: 0 });
    return tbl.get(id)!;
  };
  for (const fx of schedule) {
    if ((fx.stage ?? "group") !== "group" || !fx.groupId) continue;
    const h = ensure(fx.groupId, fx.homeTeamId);
    const a = ensure(fx.groupId, fx.awayTeamId);
    if (!fx.finished || fx.goalsHome === null || fx.goalsAway === null)
      continue;
    h.played++;
    a.played++;
    h.gf += fx.goalsHome;
    h.ga += fx.goalsAway;
    a.gf += fx.goalsAway;
    a.ga += fx.goalsHome;
    if (fx.goalsHome > fx.goalsAway) h.pts += 3;
    else if (fx.goalsHome < fx.goalsAway) a.pts += 3;
    else {
      h.pts++;
      a.pts++;
    }
  }
  const out = new Map<string, GroupTable>();
  for (const [g, tbl] of byGroup) {
    const played = new Map<string, number>();
    const rows: GroupStandingRow[] = [];
    for (const [id, agg] of tbl) {
      played.set(id, agg.played);
      rows.push({
        team: nameById.get(id) ?? id,
        played: agg.played,
        points: agg.pts,
        goalDiff: agg.gf - agg.ga,
        goalsFor: agg.gf,
      });
    }
    rows.sort(
      (x, y) =>
        y.points - x.points ||
        y.goalDiff - x.goalDiff ||
        y.goalsFor - x.goalsFor,
    );
    out.set(g, { rows, played });
  }
  return out;
}

/** Jüngste Ergebnisse (neueste zuerst, max `limit`) als Prompt-Objekte. */
function recentResultsOf(results: TeamResult[], limit: number): RecentResult[] {
  return [...results]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((r) => ({
      date: r.date,
      opponent: r.opponentName,
      scored: r.goalsFor,
      conceded: r.goalsAgainst,
      venue: r.venue,
      competition: r.competition,
    }));
}

/** P(Heim gewinnt Verlängerung/Elfmeter) aus Elo, gedämpft Richtung 50/50. */
function eloTiebreakHome(eloHome: number, eloAway: number): number {
  const eloWin = 1 / (1 + 10 ** ((eloAway - eloHome) / 400));
  return 0.5 + (eloWin - 0.5) * config.tiebreak.eloDamp;
}

/**
 * K.-o.-Weiterkommen ergänzen (Nebeninfo, nicht der getippte Score):
 * P(Heim weiter) = P(V-Sieg Heim) + P(V-Remis)·Tiebreak. probabilities beziehen
 * sich aufs Ergebnis nach Verlängerung; der Tiebreak ist P(Heim gewinnt
 * Elfmeter) = Elo-Basis, bei vorhandener KI-Einschätzung (`tiebreakWinProbHome`)
 * damit gemischt. Nur K.-o.-Spiele; mutiert prediction.
 */
function applyAdvance(match: Match): void {
  if (match.stage === "group") return;
  const p = match.prediction;
  const fb = match.featureBundle;
  if (!p || !fb) return;
  const eloTie = eloTiebreakHome(fb.home.elo, fb.away.elo);
  const aiTie = p.tiebreakWinProbHome;
  const tie =
    typeof aiTie === "number"
      ? config.tiebreak.aiWeight * aiTie +
        (1 - config.tiebreak.aiWeight) * eloTie
      : eloTie;
  const advHome = p.probabilities.home + p.probabilities.draw * tie;
  match.prediction = {
    ...p,
    advance: { home: round(advHome, 4), away: round(1 - advHome, 4) },
  };
}

/** Millisekunden pro Stunde (Anpfiff-Fenster). */
const MS_PER_HOUR = 3_600_000;

/** Aufgelöste Accuracy-Gewichte (oder null bei zu kleiner Stichprobe). */
type ModelWeightsResult = Awaited<ReturnType<typeof collectModelWeights>>;

/** Eine im Lauf fällige, noch nicht bewertete KI-Partie (gebündelt bewertet). */
interface PendingAi {
  match: Match;
  matchId: string;
  prev: Match | null;
  baselinePrediction: Prediction;
  input: EvaluateInput;
}

/**
 * Markt-Snapshot der Partie: aktuelle Quoten (ggf. Heim/Auswärts getauscht),
 * sonst der zuletzt bekannte plausible Snapshot. The Odds API liefert nach
 * Anpfiff keine Quoten mehr — ohne diesen Fallback ginge der Markt für beendete
 * Spiele (und damit die "wir vs. Markt"-Auswertung) verloren. Einen früher
 * gespeicherten unplausiblen Snapshot (z. B. alte In-Play-Linie) verwerfen.
 */
function resolveMarket(
  fx: NormalizedFixture,
  prev: Match | null,
  ctx: WriteMatchesCtx,
): MarketOdds | undefined {
  const homeName = ctx.nameById.get(fx.homeTeamId) ?? fx.homeTeamId;
  const awayName = ctx.nameById.get(fx.awayTeamId) ?? fx.awayTeamId;
  const market =
    ctx.odds.get(oddsKey(homeName, awayName)) ??
    (ctx.odds.has(oddsKey(awayName, homeName))
      ? swapMarket(ctx.odds.get(oddsKey(awayName, homeName))!)
      : undefined);
  if (market) return market;
  if (prev?.market && isPlausibleMarket(prev.market.probabilities)) {
    return prev.market;
  }
  return undefined;
}

/** Beendete Partie: letzten Tipp + FeatureBundle bewahren (Anzeige/Accuracy). */
function applyFinishedPrediction(match: Match, prev: Match | null): void {
  if (!prev?.prediction) return;
  match.prediction = prev.prediction;
  if (prev.featureBundle) match.featureBundle = prev.featureBundle;
}

/** Aktueller Gruppenkontext (Tabelle + Spieltag) für die KI, falls Gruppenspiel. */
function resolveGroupContext(
  fx: NormalizedFixture,
  groupTables: Map<string, GroupTable>,
): GroupContext | undefined {
  const gt = fx.groupId ? groupTables.get(fx.groupId) : undefined;
  const matchday = gt ? (gt.played.get(fx.homeTeamId) ?? 0) + 1 : undefined;
  if (!gt || !fx.groupId || !matchday) return undefined;
  return {
    groupId: fx.groupId,
    matchday,
    remainingAfter: Math.max(0, 3 - matchday),
    table: gt.rows,
  };
}

interface PlanArgs {
  fx: NormalizedFixture;
  match: Match;
  prev: Match | null;
  ctx: WriteMatchesCtx;
  homeResults: TeamResult[] | undefined;
  awayResults: TeamResult[] | undefined;
  groupTables: Map<string, GroupTable>;
  modelWeights: ModelWeightsResult | null;
}

/**
 * Bestimmt für eine Partie den Tipp: setzt `match.prediction`/`featureBundle`
 * direkt (beendet, außerhalb Fenster oder Baseline) und liefert `skippedInc`
 * (0/1 für den aiSkipped-Zähler) — oder liefert stattdessen einen `pending`-
 * Eintrag für die gebündelte KI-Bewertung nach der Schleife.
 */
function planMatchPrediction(
  a: PlanArgs,
): { pending: PendingAi } | { skippedInc: number } {
  const { fx, match, prev, ctx, homeResults, awayResults, groupTables } = a;
  const { nameById, eloOf, now, ensemble } = ctx;

  // Beendet oder ohne Historie-Basis: letzten Tipp bewahren, kein KI-Call.
  if (fx.finished || !homeResults || !awayResults) {
    if (fx.finished) applyFinishedPrediction(match, prev);
    return { skippedInc: 0 };
  }

  const { featureBundle, baseline, mostLikelyScore } = runEngine(
    {
      homeTeamId: fx.homeTeamId,
      awayTeamId: fx.awayTeamId,
      neutral: fx.neutral,
      altitude: fx.altitude ?? null,
    },
    { teamId: fx.homeTeamId, elo: eloOf(fx.homeTeamId), results: homeResults },
    { teamId: fx.awayTeamId, elo: eloOf(fx.awayTeamId), results: awayResults },
    now,
  );
  match.featureBundle = featureBundle;
  const inputHash = featureHash(featureBundle);

  // Baseline-Prediction als Default.
  const baselinePrediction = {
    generatedAt: now.toISOString(),
    predictedScore: mostLikelyScore,
    probabilities: baseline.probabilities,
    confidence: confidenceFromProbs(baseline.probabilities),
    baseline,
    inputHash,
  };

  const homeNews = ctx.newsByTeam.get(fx.homeTeamId) ?? [];
  const awayNews = ctx.newsByTeam.get(fx.awayTeamId) ?? [];

  // Kosten-Gate: KI nur für Partien im Anpfiff-Fenster (z. B. ≤72 h).
  const hoursUntilKickoff =
    (new Date(match.date).getTime() - now.getTime()) / MS_PER_HOUR;
  const inAiWindow =
    ctx.aiWindowHours === null ||
    (hoursUntilKickoff >= 0 && hoursUntilKickoff <= ctx.aiWindowHours);

  // Kein Ensemble, außerhalb Fenster oder kein Re-Trigger → Tipp/Baseline.
  if (!ensemble || !inAiWindow) {
    match.prediction = prev?.prediction ?? baselinePrediction;
    return { skippedInc: ensemble && !inAiWindow ? 1 : 0 };
  }
  const decision = ctx.forceEval
    ? { shouldEvaluate: true, reason: "Force (manuell)" }
    : decideRetrigger(prev ?? match, inputHash, homeNews, awayNews, now);
  if (!decision.shouldEvaluate) {
    match.prediction = prev?.prediction ?? baselinePrediction;
    return { skippedInc: 1 };
  }

  // Fällig → sammeln (gebündelt via Batches-API bewertet, 50 % günstiger).
  // Markt-Anker: echte Buchmacher-Quoten bevorzugt, sonst externer Prior.
  const prior =
    match.market?.probabilities ?? ctx.externalPriors?.byMatch.get(fx.matchId);
  const groupContext = resolveGroupContext(fx, groupTables);
  return {
    pending: {
      match,
      matchId: fx.matchId,
      prev,
      baselinePrediction,
      input: {
        homeName: nameById.get(fx.homeTeamId) ?? fx.homeTeamId,
        awayName: nameById.get(fx.awayTeamId) ?? fx.awayTeamId,
        featureBundle,
        baseline,
        homeNews,
        awayNews,
        inputHash,
        now,
        modelWeights: a.modelWeights,
        ...(prior ? { marketProbabilities: prior } : {}),
        ...(groupContext ? { groupContext } : {}),
        homeRecent: recentResultsOf(homeResults, 5),
        awayRecent: recentResultsOf(awayResults, 5),
        ...(match.stage !== "group" ? { isKnockout: true } : {}),
      },
    },
  };
}

/** Baut das Match-Dokument-Gerüst (ohne prediction) aus Fixture + Vorstand. */
function baseMatchDoc(fx: NormalizedFixture, prev: Match | null): Match {
  const stage: Stage = fx.stage ?? "group";
  const actualResult: ScoreLine | null =
    fx.finished && fx.goalsHome !== null && fx.goalsAway !== null
      ? { home: fx.goalsHome, away: fx.goalsAway }
      : null;
  const match: Match = {
    id: fx.matchId,
    date: fx.dateTime ?? `${fx.date}T00:00:00Z`,
    stage,
    homeTeamId: fx.homeTeamId,
    awayTeamId: fx.awayTeamId,
    venue: {
      city: fx.ground ?? "TBD",
      neutral: fx.neutral,
      ...(fx.altitude !== undefined ? { altitude: fx.altitude } : {}),
    },
    status: fx.finished ? "finished" : "scheduled",
    actualResult,
    predictionHistory: prev?.predictionHistory ?? [],
  };
  if (fx.groupId) match.groupId = fx.groupId;
  // V-Ergebnis: "n.V."-Marker nur bei tatsächlich beendetem Spiel setzen.
  if (fx.finished && fx.afterExtraTime) match.afterExtraTime = true;
  return match;
}

/**
 * Bewertet die gesammelten fälligen Partien gebündelt (Claude: Batches-API),
 * schiebt den alten KI-Tipp in die Historie, schreibt die Dateien und liefert
 * die Zähler + geschriebenen Matches.
 */
async function applyBundledAi(
  pendingAi: PendingAi[],
  ensemble: Ensemble,
): Promise<{ aiEvaluated: number; aiSkipped: number; matches: Match[] }> {
  console.log(
    `[predict] ${pendingAi.length} Partien fällig — Bewertung startet`,
  );
  let predictions: Prediction[] | null = null;
  try {
    predictions = await ensemble.evaluateMany(pendingAi.map((p) => p.input));
  } catch (err) {
    console.warn("[predict] Bündel-Bewertung fehlgeschlagen:", err);
  }
  let aiEvaluated = 0;
  let aiSkipped = 0;
  const matches: Match[] = [];
  for (let i = 0; i < pendingAi.length; i++) {
    const p = pendingAi[i]!;
    const aiPred = predictions?.[i];
    if (aiPred) {
      // Alten KI-Tipp in die Historie schieben.
      if (p.prev?.prediction?.models) {
        p.match.predictionHistory = [
          ...p.match.predictionHistory,
          {
            generatedAt: p.prev.prediction.generatedAt,
            predictedScore: p.prev.prediction.predictedScore,
            probabilities: p.prev.prediction.probabilities,
            confidence: p.prev.prediction.confidence,
          },
        ];
      }
      p.match.prediction = aiPred;
      aiEvaluated++;
    } else {
      p.match.prediction = p.prev?.prediction ?? p.baselinePrediction;
      aiSkipped++;
    }
    applyAdvance(p.match);
    await writeJson(matchPath(p.matchId), Match, p.match);
    matches.push(p.match);
  }
  return { aiEvaluated, aiSkipped, matches };
}

/**
 * Accuracy-Gewichte (Verbesserung 6): aus den bereits beendeten Partien den
 * mittleren RPS je Modell bestimmen — das treffsicherere Modell bekommt bei
 * allen KI-Tipps dieses Laufs mehr Gewicht. Neutral (null), solange die
 * Stichprobe zu klein ist oder die Gewichtung deaktiviert wurde.
 */
async function accuracyWeights(
  schedule: NormalizedFixture[],
  ensemble: Ensemble | null,
): Promise<ModelWeightsResult | null> {
  if (!ensemble || !config.ensemble.accuracyWeighted) return null;
  const modelWeights = await collectModelWeights(schedule);
  if (modelWeights) {
    const { weights, rpsMean, samples } = modelWeights;
    console.log(
      `[predict] Accuracy-Gewichte: Claude ${weights.claude} (RPS ${rpsMean.claude}, n=${samples.claude}) · ` +
        `ChatGPT ${weights.chatgpt} (RPS ${rpsMean.chatgpt}, n=${samples.chatgpt})`,
    );
  }
  return modelWeights;
}

/**
 * Schreibt die Match-Dokumente. Für anstehende Partien mit bekannter Historie:
 * Feature-Bundle + Baseline (Phase 4); falls KI-Ensemble aktiv und Re-Trigger
 * greift, wird der KI-Tipp berechnet (alter Tipp → predictionHistory).
 * Inkrementell: bestehende matches/*.json werden gelesen, um Re-Trigger und
 * Historie zu bewahren.
 */
async function writeMatches(
  schedule: NormalizedFixture[],
  ctx: WriteMatchesCtx,
): Promise<WriteMatchesResult> {
  const { nameById, ensemble } = ctx;
  // Gruppentabellen einmal aus den bereits gespielten Spielen ableiten
  // (Einsatz-Kontext + Spieltag für die KI).
  const groupTables = computeGroupTables(schedule, nameById);
  let written = 0;
  let aiSkipped = 0;
  const matches: Match[] = [];
  const pendingAi: PendingAi[] = [];
  const modelWeights = await accuracyWeights(schedule, ensemble);

  for (const fx of schedule) {
    // Bestehendes Match laden (für Re-Trigger + predictionHistory + Tipp).
    const prev = await readJsonOptional<Match>(matchPath(fx.matchId), Match);
    const match = baseMatchDoc(fx, prev);

    const market = resolveMarket(fx, prev, ctx);
    if (market) match.market = market;

    const plan = planMatchPrediction({
      fx,
      match,
      prev,
      ctx,
      homeResults: ctx.resultsByTeam.get(fx.homeTeamId),
      awayResults: ctx.resultsByTeam.get(fx.awayTeamId),
      groupTables,
      modelWeights,
    });
    // Fällige KI-Partien werden gesammelt und erst nach der Schleife (gebündelt)
    // bewertet + geschrieben — hier also überspringen.
    if ("pending" in plan) {
      pendingAi.push(plan.pending);
      continue;
    }
    aiSkipped += plan.skippedInc;

    applyAdvance(match);
    await writeJson(matchPath(fx.matchId), Match, match);
    matches.push(match);
    written++;
  }

  let aiEvaluated = 0;
  // Gesammelte fällige Partien gebündelt bewerten (Claude: Batches-API).
  if (pendingAi.length > 0 && ensemble) {
    const bundled = await applyBundledAi(pendingAi, ensemble);
    aiEvaluated = bundled.aiEvaluated;
    aiSkipped += bundled.aiSkipped;
    matches.push(...bundled.matches);
    written += bundled.matches.length;
  }

  return { written, aiEvaluated, aiSkipped, matches };
}

/**
 * Schreibt predictions-index.json (leichte Match-Liste für die App) inkl.
 * Accuracy je beendeter Partie (Brier/RPS/Trefferquoten) + Aggregate.
 * Gibt die Anzahl bewerteter (beendeter) Partien zurück.
 */
async function writePredictionsIndex(
  matches: Match[],
  nowIso: string,
): Promise<number> {
  const entries: PredictionIndexEntry[] = matches
    .map((m) => {
      const pred = m.prediction;
      const entry: PredictionIndexEntry = {
        matchId: m.id,
        date: m.date,
        stage: m.stage,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        actualResult: m.actualResult,
      };
      // "n.V."-Marker (Ist stand erst nach Verlängerung fest) durchreichen.
      if (m.afterExtraTime) entry.afterExtraTime = true;
      if (pred) {
        entry.predictedScore = pred.predictedScore;
        entry.probabilities = pred.probabilities;
        entry.confidence = pred.confidence;
        // Erwartete Tore (Baseline) für die tor-basierte Gruppensimulation.
        if (pred.baseline?.expectedGoals) {
          entry.expectedGoals = pred.baseline.expectedGoals;
        }
        // K.-o.-Weiterkommen (Nebeninfo fürs Bracket; Elfmeter nur hier).
        if (pred.advance) entry.advance = pred.advance;
      }
      // Markt-Snapshot für den "wir vs. Markt"-Vergleich in der Bilanz.
      if (m.market?.probabilities) {
        entry.marketProbabilities = m.market.probabilities;
      }
      // Accuracy nur für beendete Partien mit Tipp.
      if (m.actualResult && pred) {
        entry.accuracy = scoreMatch(
          pred.predictedScore,
          pred.probabilities,
          m.actualResult,
        );
      }
      return entry;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const aggregate = aggregateAccuracy(
    entries.map((e) => {
      const base: { accuracy?: AccuracyEntry; actualResult: ScoreLine | null } =
        { actualResult: e.actualResult };
      if (e.accuracy) base.accuracy = e.accuracy;
      return base;
    }),
  );

  // Modell-Vergleich Claude vs. ChatGPT (Accuracy-Seite): Aggregate über die
  // EIGENEN Tipps jedes Modells + aktuelle Ensemble-Gewichte.
  const finishedWithModels: FinishedWithModels[] = matches
    .filter((m) => m.actualResult && m.prediction?.models)
    .map((m) => ({
      actualResult: m.actualResult!,
      models: m.prediction!.models!,
    }));
  const modelComparison = computeModelComparison(
    finishedWithModels,
    config.ensemble.accuracyMinSample,
  );

  await writeJson(predictionsIndexPath, PredictionsIndex, {
    lastUpdated: nowIso,
    aggregate,
    ...(modelComparison ? { modelComparison } : {}),
    entries,
  });
  return aggregate.finishedCount;
}

/** Baut das Team-Dokument; optionale Felder werden bewusst weggelassen. */
function buildTeam(
  summary: TeamSummary,
  lastUpdated: string,
  results: TeamResult[],
  potentialOpponents: PotentialOpponent[],
  news: NewsItem[],
  elo: number,
): Team {
  const now = new Date(lastUpdated);
  const f = computeForm(results, now);
  // recencyWeight pro Ergebnis annotieren (für die UI / Transparenz).
  const annotated: TeamResult[] = results.map((r) => ({
    ...r,
    recencyWeight: round(recencyWeightFor(r.date, now), 3),
  }));

  const team: Team = {
    id: summary.id,
    name: summary.name,
    code: summary.code,
    groupId: summary.groupId,
    elo: Math.round(elo),
    lastUpdated,
    results: annotated,
    form: {
      last10Points: Math.round(f.recentForm * config.formWindow),
      weightedForm: round(f.weightedForm, 3),
      goalsForAvg: round(f.goalsForAvg, 3),
      goalsAgainstAvg: round(f.goalsAgainstAvg, 3),
      cleanSheetRate: round(f.cleanSheetRate, 3),
    },
    potentialOpponents,
    news,
  };
  if (summary.logo) team.logo = summary.logo;
  return team;
}

async function persistProgress(progress: Progress): Promise<void> {
  await writeProgress(progress);
}

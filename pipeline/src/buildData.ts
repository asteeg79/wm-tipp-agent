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
import { computeEloRatings, gamesFromHistories } from "./features/elo.js";
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
import { loadOdds, oddsKey, swapMarket } from "./sources/oddsApi.js";
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

export async function buildData(
  tournamentProvider: TournamentProvider,
  historyProvider: HistoryProvider,
  options: BuildOptions = { withNews: true, withAi: true },
): Promise<BuildStats> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Turnierstruktur → index.json
  const { tournament, groups, teams, rankByTeamId } =
    await tournamentProvider.getTournament();
  await writeJson(indexPath, IndexFile, {
    tournament,
    lastUpdated: nowIso,
    groups,
    teams,
  });

  // 2) Mögliche Gegner ableiten
  const opponentSets = deriveOpponentSets(teams, groups, rankByTeamId);

  // 3) Spielplan laden (Match-Dateien werden nach der Engine geschrieben).
  const schedule = await tournamentProvider.getSchedule();

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
  const historyByTeam = new Map<string, HistoryMatch[]>();
  const resultsByTeam = new Map<string, TeamResult[]>();
  const newsByTeam = new Map<string, NewsItem[]>();
  const nameById = new Map<string, string>();
  for (const t of teams) nameById.set(t.id, t.name);
  const limitedTeams = Number.isFinite(maxTeams)
    ? teams.slice(0, maxTeams)
    : teams;

  for (const team of limitedTeams) {
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

  // 5) Globale Elo-Ratings aus der gesamten Historie (FIFA-Seed als Startwert).
  const eloRatings = computeEloRatings(gamesFromHistories(historyByTeam));
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
  for (const team of limitedTeams) {
    const results = resultsByTeam.get(team.id);
    if (!results) continue; // Historie fehlgeschlagen
    try {
      const refs = opponentSets.get(team.id) ?? [];
      const potentialOpponents: PotentialOpponent[] = refs.map((r) => ({
        teamId: r.teamId,
        stage: r.stage,
        h2hSummary: computeH2h(r.teamId, historyByTeam.get(team.id) ?? []),
      }));

      let news: NewsItem[] = [];
      if (newsAggregator) {
        try {
          news = await newsAggregator.forTeam(team, newsFilter ?? undefined);
          stats.newsLoaded += news.length;
        } catch (err) {
          console.warn(`[pipeline] News für ${team.id} fehlgeschlagen:`, err);
        }
      }
      newsByTeam.set(team.id, news);

      await writeJson(
        teamPath(team.id),
        Team,
        buildTeam(
          team,
          nowIso,
          results,
          potentialOpponents,
          news,
          eloOf(team.id),
        ),
      );
      progress.teamsBackfilled[team.id] = nowIso;
      stats.teamsWritten++;
    } catch (err) {
      stats.teamsFailed++;
      console.warn(`[pipeline] Team ${team.id} übersprungen:`, err);
    }
  }

  // 7) Matches mit Engine (Feature-Bundle + Baseline) + optional KI-Ensemble.
  const ensemble = options.withAi ? makeEnsemble() : null;
  if (ensemble && !ensemble.active) {
    console.warn(
      "[pipeline] Kein KI-Key gesetzt → nur Baseline (graceful degradation).",
    );
  } else if (ensemble) {
    console.log(
      `[pipeline] KI-Ensemble aktiv: ${ensemble.modelIds.join(", ")}`,
    );
  }

  const externalPriors = loadExternalPriors();
  if (externalPriors) {
    console.log(
      `[pipeline] Externe Priors geladen (${externalPriors.source}): ${externalPriors.byMatch.size} Partien`,
    );
  }

  // Buchmacher-Quoten (optional; nur mit ODDS_API_KEY, gecacht).
  const odds = await loadOdds();
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
  const { resultsByTeam, newsByTeam, nameById, eloOf, now, ensemble } = ctx;
  let written = 0;
  let aiEvaluated = 0;
  let aiSkipped = 0;
  const matches: Match[] = [];
  const MS_PER_HOUR = 3_600_000;

  // Fällige KI-Bewertungen: in der Schleife nur SAMMELN, nach der Schleife
  // gebündelt bewerten (Claude via Batches-API → 50 % günstiger) und erst
  // dann die Match-Dateien schreiben.
  interface PendingAi {
    match: Match;
    matchId: string;
    prev: Match | null;
    baselinePrediction: Prediction;
    input: EvaluateInput;
  }
  const pendingAi: PendingAi[] = [];

  // Accuracy-Gewichte (Verbesserung 6): aus den bereits beendeten Partien
  // den mittleren RPS je Modell bestimmen — das treffsicherere Modell bekommt
  // bei allen KI-Tipps dieses Laufs mehr Gewicht. Neutral (null), solange die
  // Stichprobe zu klein ist oder die Gewichtung deaktiviert wurde.
  const modelWeights =
    ensemble && config.ensemble.accuracyWeighted
      ? await collectModelWeights(schedule)
      : null;
  if (modelWeights) {
    const { weights, rpsMean, samples } = modelWeights;
    console.log(
      `[predict] Accuracy-Gewichte: Claude ${weights.claude} (RPS ${rpsMean.claude}, n=${samples.claude}) · ` +
        `ChatGPT ${weights.chatgpt} (RPS ${rpsMean.chatgpt}, n=${samples.chatgpt})`,
    );
  }

  for (const fx of schedule) {
    const stage: Stage = fx.stage ?? "group";
    const actualResult: ScoreLine | null =
      fx.finished && fx.goalsHome !== null && fx.goalsAway !== null
        ? { home: fx.goalsHome, away: fx.goalsAway }
        : null;

    // Bestehendes Match laden (für Re-Trigger + predictionHistory + Tipp).
    const prev = await readJsonOptional<Match>(matchPath(fx.matchId), Match);

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

    // Buchmacher-Quoten zuordnen (über normalisierte Teamnamen; bei
    // umgekehrter Paarung Heim/Auswärts tauschen).
    const homeName = ctx.nameById.get(fx.homeTeamId) ?? fx.homeTeamId;
    const awayName = ctx.nameById.get(fx.awayTeamId) ?? fx.awayTeamId;
    const market =
      ctx.odds.get(oddsKey(homeName, awayName)) ??
      (ctx.odds.has(oddsKey(awayName, homeName))
        ? swapMarket(ctx.odds.get(oddsKey(awayName, homeName))!)
        : undefined);
    if (market) match.market = market;

    const homeResults = resultsByTeam.get(fx.homeTeamId);
    const awayResults = resultsByTeam.get(fx.awayTeamId);

    if (!fx.finished && homeResults && awayResults) {
      const { featureBundle, baseline, mostLikelyScore } = runEngine(
        {
          homeTeamId: fx.homeTeamId,
          awayTeamId: fx.awayTeamId,
          neutral: fx.neutral,
          altitude: fx.altitude ?? null,
        },
        {
          teamId: fx.homeTeamId,
          elo: eloOf(fx.homeTeamId),
          results: homeResults,
        },
        {
          teamId: fx.awayTeamId,
          elo: eloOf(fx.awayTeamId),
          results: awayResults,
        },
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

      const homeNews = newsByTeam.get(fx.homeTeamId) ?? [];
      const awayNews = newsByTeam.get(fx.awayTeamId) ?? [];

      // Kosten-Gate: KI nur für Partien im Anpfiff-Fenster (z. B. ≤72 h).
      // Außerhalb → kein KI-Call, Tipp/Baseline bleibt unverändert.
      const hoursUntilKickoff =
        (new Date(match.date).getTime() - now.getTime()) / MS_PER_HOUR;
      const inAiWindow =
        ctx.aiWindowHours === null ||
        (hoursUntilKickoff >= 0 && hoursUntilKickoff <= ctx.aiWindowHours);

      if (ensemble && inAiWindow) {
        const decision = decideRetrigger(
          prev ?? match,
          inputHash,
          homeNews,
          awayNews,
          now,
        );
        if (decision.shouldEvaluate) {
          // Markt-Anker für die KI: echte Buchmacher-Quoten bevorzugt,
          // sonst der optionale externe Prior.
          const prior =
            match.market?.probabilities ??
            ctx.externalPriors?.byMatch.get(fx.matchId);
          // NICHT sofort bewerten: fällige Partien werden gesammelt und nach
          // der Schleife gebündelt bewertet (Claude via Batches-API → 50 %
          // günstiger). Datei-Write + Zähler folgen ebenfalls erst dann.
          pendingAi.push({
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
              modelWeights,
              ...(prior ? { marketProbabilities: prior } : {}),
            },
          });
          continue;
        } else {
          // Unverändert → vorhandenen Tipp behalten, sonst Baseline.
          match.prediction = prev?.prediction ?? baselinePrediction;
          aiSkipped++;
        }
      } else {
        // Kein Ensemble, außerhalb Anpfiff-Fenster oder kein Key:
        // vorhandenen (KI-)Tipp behalten, sonst Baseline. Kein KI-Call.
        match.prediction = prev?.prediction ?? baselinePrediction;
        if (ensemble && !inAiWindow) aiSkipped++;
      }
    } else if (fx.finished && prev?.prediction) {
      // Beendete Partie: letzten Tipp bewahren (für Accuracy + Anzeige).
      match.prediction = prev.prediction;
      if (prev.featureBundle) match.featureBundle = prev.featureBundle;
    }

    await writeJson(matchPath(fx.matchId), Match, match);
    matches.push(match);
    written++;
  }

  // Gesammelte fällige Partien gebündelt bewerten (Claude: Batches-API).
  if (pendingAi.length > 0 && ensemble) {
    console.log(
      `[predict] ${pendingAi.length} Partien fällig — Bewertung startet`,
    );
    let predictions: Prediction[] | null = null;
    try {
      predictions = await ensemble.evaluateMany(pendingAi.map((p) => p.input));
    } catch (err) {
      console.warn("[predict] Bündel-Bewertung fehlgeschlagen:", err);
    }
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
      await writeJson(matchPath(p.matchId), Match, p.match);
      matches.push(p.match);
      written++;
    }
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
      if (pred) {
        entry.predictedScore = pred.predictedScore;
        entry.probabilities = pred.probabilities;
        entry.confidence = pred.confidence;
        // Erwartete Tore (Baseline) für die tor-basierte Gruppensimulation.
        if (pred.baseline?.expectedGoals) {
          entry.expectedGoals = pred.baseline.expectedGoals;
        }
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

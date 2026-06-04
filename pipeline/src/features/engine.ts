/**
 * Prognose-Engine (Phase 4): führt Form, Elo, Poisson-Baseline und H2H zu
 * einem Feature-Bundle + Baseline pro anstehender Partie zusammen.
 * Rein deterministisch und reproduzierbar (keine KI, kein Zufall).
 */
import { createHash } from "node:crypto";
import type {
  Baseline,
  FeatureBundle,
  TeamFeatures,
  TeamResult,
} from "@wm/shared";
import { config } from "../../config.js";
import { computeForm, type FormMetrics } from "./form.js";
import { estimateLambdas, poissonBaseline } from "./poisson.js";
import { isEuropean, isMajorNation } from "./confederation.js";

/** Gastgeber-Nationen 2026 (Heimvorteil). */
const HOST_TEAM_IDS = new Set(["USA", "CAN", "MEX"]);

export interface TeamEngineInput {
  teamId: string;
  elo: number;
  results: TeamResult[];
}

export interface EngineMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  neutral: boolean;
  altitude: number | null;
}

export interface EngineOutput {
  featureBundle: FeatureBundle;
  baseline: Baseline;
  /** Wahrscheinlichstes Ergebnis aus der Score-Matrix (besser als round(xG)). */
  mostLikelyScore: { home: number; away: number };
}

function toTeamFeatures(
  teamId: string,
  elo: number,
  form: FormMetrics,
): TeamFeatures {
  return {
    teamId,
    elo: Math.round(elo),
    weightedForm: round3(form.weightedForm),
    recentForm: round3(form.recentForm),
    goalsForAvg: round3(form.goalsForAvg),
    goalsAgainstAvg: round3(form.goalsAgainstAvg),
    cleanSheetRate: round3(form.cleanSheetRate),
    matchesCount: form.matchesCount,
    daysSinceLastMatch: form.daysSinceLastMatch,
  };
}

/** H2H aus Sicht des Heimteams, aus dessen Ergebnissen berechnet. */
function h2hFromResults(
  homeResults: TeamResult[],
  awayTeamId: string,
): FeatureBundle["h2h"] {
  const h = {
    played: 0,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    homeGoals: 0,
    awayGoals: 0,
  };
  for (const r of homeResults) {
    if (r.opponentId !== awayTeamId) continue;
    h.played++;
    h.homeGoals += r.goalsFor;
    h.awayGoals += r.goalsAgainst;
    if (r.goalsFor > r.goalsAgainst) h.homeWins++;
    else if (r.goalsFor === r.goalsAgainst) h.draws++;
    else h.awayWins++;
  }
  return h;
}

/** Baut Feature-Bundle + deterministische Baseline für eine Partie. */
export function runEngine(
  match: EngineMatchInput,
  home: TeamEngineInput,
  away: TeamEngineInput,
  now: Date,
): EngineOutput {
  const homeForm = computeForm(home.results, now);
  const awayForm = computeForm(away.results, now);

  const hostIsHome: boolean | null = HOST_TEAM_IDS.has(match.homeTeamId)
    ? true
    : HOST_TEAM_IDS.has(match.awayTeamId)
      ? false
      : null;

  // Effektive Elo-Differenz inkl. HFA, falls Gastgeber beteiligt.
  let eloDiff = home.elo - away.elo;
  if (hostIsHome === true) eloDiff += config.homeFieldAdvantageElo;
  else if (hostIsHome === false) eloDiff -= config.homeFieldAdvantageElo;

  const lambdas = estimateLambdas(eloDiff, homeForm, awayForm, hostIsHome, {
    homeId: match.homeTeamId,
    awayId: match.awayTeamId,
    homeEuropean: isEuropean(match.homeTeamId),
    awayEuropean: isEuropean(match.awayTeamId),
    homeMajor: isMajorNation(match.homeTeamId),
    awayMajor: isMajorNation(match.awayTeamId),
  });
  const base = poissonBaseline(lambdas.home, lambdas.away);

  const featureBundle: FeatureBundle = {
    generatedAt: now.toISOString(),
    home: toTeamFeatures(match.homeTeamId, home.elo, homeForm),
    away: toTeamFeatures(match.awayTeamId, away.elo, awayForm),
    h2h: h2hFromResults(home.results, match.awayTeamId),
    context: {
      neutralVenue: match.neutral,
      altitude: match.altitude,
      hostAdvantageTeamId:
        hostIsHome === true
          ? match.homeTeamId
          : hostIsHome === false
            ? match.awayTeamId
            : null,
    },
  };

  const baseline: Baseline = {
    source: "elo+poisson",
    probabilities: base.probabilities,
    expectedGoals: base.expectedGoals,
  };

  return { featureBundle, baseline, mostLikelyScore: base.mostLikelyScore };
}

/** Stabiler Hash des Feature-Bundles für die Re-Trigger-Logik (Phase 5). */
export function featureHash(bundle: FeatureBundle): string {
  // generatedAt ausklammern, damit der Hash nur bei echten Datenänderungen wechselt.
  const { generatedAt: _omit, ...stable } = bundle;
  const json = JSON.stringify(stable);
  return "sha256:" + createHash("sha256").update(json).digest("hex");
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

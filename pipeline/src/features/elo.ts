/**
 * Elo-Ratings nach World-Football-Elo-Logik (Abschnitt 11.2), intern aus der
 * Historie berechnet. Deterministisch: gleiche Spiele → gleiche Ratings.
 *
 *   erwartetes Ergebnis: E = 1 / (1 + 10^((R_b − R_a)/400))
 *   Update: R' = R + K · G · (W − E)
 *     W = 1/0.5/0 (Sieg/Remis/Niederlage)
 *     G = Tordifferenz-Multiplikator (optional)
 */
import { config } from "../../config.js";
import type { HistoryMatch } from "../sources/types.js";
import { ELO_SEED } from "./eloSeed.js";

/** Ein chronologisch sortierbares Spiel mit beiden kanonischen IDs. */
export interface EloGame {
  date: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  neutral: boolean;
}

/** Tordifferenz-Multiplikator G (World-Football-Elo). */
function goalMultiplier(goalDiff: number): number {
  if (!config.elo.goalDifferenceFactor) return 1;
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/** Erwartungswert für Team A gegen B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Spielt alle Spiele chronologisch durch und liefert die finalen Ratings.
 * HFA wird hier NICHT eingerechnet (neutrale Bewertung der Teamstärke); der
 * Heimvorteil kommt erst in der Poisson-Baseline für die konkrete Partie dazu.
 *
 * @param seed  Start-Elo je Team (FIFA-Code → Wert). Default: ELO_SEED.
 *              Leeres Objekt {} → alle Teams starten bei config.elo.initial
 *              (so kann der Backtest mit/ohne Seed vergleichen).
 */
export function computeEloRatings(
  games: EloGame[],
  seed: Record<string, number> = ELO_SEED,
): Map<string, number> {
  const ratings = new Map<string, number>();
  const get = (id: string): number =>
    ratings.get(id) ?? seed[id] ?? config.elo.initial;

  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  for (const g of sorted) {
    const ra = get(g.homeId);
    const rb = get(g.awayId);
    const ea = expectedScore(ra, rb);
    const eb = 1 - ea;

    let wa: number;
    if (g.homeGoals > g.awayGoals) wa = 1;
    else if (g.homeGoals === g.awayGoals) wa = 0.5;
    else wa = 0;
    const wb = 1 - wa;

    const gMul = goalMultiplier(g.homeGoals - g.awayGoals);
    const k = config.elo.k * gMul;

    ratings.set(g.homeId, ra + k * (wa - ea));
    ratings.set(g.awayId, rb + k * (wb - eb));
  }
  return ratings;
}

/**
 * Baut die globale Spielmenge aus den per-Team gesammelten Historien.
 * Dedupe über matchId, damit jedes Spiel nur einmal in die Elo-Berechnung
 * eingeht (jedes Spiel taucht aus Sicht beider Teams auf).
 */
export function gamesFromHistories(
  historyByTeam: Map<string, HistoryMatch[]>,
): EloGame[] {
  const byId = new Map<string, EloGame>();
  for (const [teamId, history] of historyByTeam) {
    for (const m of history) {
      if (byId.has(m.matchId)) continue;
      // m ist aus Sicht von teamId normalisiert → in Heim/Auswärts auflösen.
      const homeId = m.home ? teamId : m.opponentId;
      const awayId = m.home ? m.opponentId : teamId;
      const homeGoals = m.home ? m.goalsFor : m.goalsAgainst;
      const awayGoals = m.home ? m.goalsAgainst : m.goalsFor;
      byId.set(m.matchId, {
        date: m.date,
        homeId,
        awayId,
        homeGoals,
        awayGoals,
        neutral: m.neutral,
      });
    }
  }
  return [...byId.values()];
}

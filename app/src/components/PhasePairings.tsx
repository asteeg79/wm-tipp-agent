import { useTranslation } from "react-i18next";
import type {
  PredictionIndexEntry,
  PredictionsIndex,
  TeamSummary,
} from "@wm/shared";
import { formatPercent } from "../lib/format.js";
import type {
  KoStage,
  ProjectedBracket,
  ProjectedSide,
} from "../lib/simulate.js";
import { TeamBadge } from "./TeamBadge.js";

interface Props {
  proj: ProjectedBracket;
  stage: KoStage;
  teams: Map<string, TeamSummary>;
  /** Alle Gruppenspiele gespielt? → endgültige statt projizierte Paarungen. */
  groupsDone: boolean;
  /** Für real ausgeloste Partien den echten KI-Tipp statt Elo-Projektion. */
  predIndex: PredictionsIndex | undefined;
}

const pairKey = (a: string, b: string): string => [a, b].sort().join("|");

interface TipDisplay {
  aGoals: number;
  bGoals: number;
  /** Hervorgehobenes Team: bei K.-o. der Weiterkommende, sonst 90′-Sieger. */
  winner: string;
  /** Bei K.-o. die Weiterkommen-Wahrscheinlichkeit, sonst die 1X2-Sieg-Wkt. */
  winProb: number;
  /** true = winProb/winner meint „kommt weiter" (nach Verlängerung/Elfmeter). */
  advance: boolean;
}

/** Anzeigewerte aus dem echten KI-Tipp einer aufgelösten K.-o.-Partie. */
function tipDisplay(entry: PredictionIndexEntry, a: string): TipDisplay | null {
  const ps = entry.predictedScore;
  const pr = entry.probabilities;
  if (!ps || !pr) return null;
  const aHome = entry.homeTeamId === a;
  const aGoals = aHome ? ps.home : ps.away;
  const bGoals = aHome ? ps.away : ps.home;
  // K.-o.: Score = 90 Min (Remis möglich), Sieger/% = WEITERKOMMEN.
  if (entry.advance) {
    const homeAdvances = entry.advance.home >= entry.advance.away;
    return {
      aGoals,
      bGoals,
      winner: homeAdvances ? entry.homeTeamId : entry.awayTeamId,
      winProb: homeAdvances ? entry.advance.home : entry.advance.away,
      advance: true,
    };
  }
  // Sonst (z. B. vor Auslosung): 90′-Tendenz; bei Remis nach Wahrscheinlichkeit.
  const winnerHome =
    ps.home !== ps.away ? ps.home > ps.away : pr.home >= pr.away;
  return {
    aGoals,
    bGoals,
    winner: winnerHome ? entry.homeTeamId : entry.awayTeamId,
    winProb: winnerHome ? pr.home : pr.away,
    advance: false,
  };
}

/** Herkunfts-Label einer Sechzehntelfinal-Seite (Sieger A / Zweiter B / 3. X). */
function sourceLabel(
  t: ReturnType<typeof useTranslation>["t"],
  side: ProjectedSide,
): string {
  const s = side.source;
  if (s.kind === "winner")
    return t("bracket.source.winner", { group: s.group });
  if (s.kind === "runnerUp")
    return t("bracket.source.runnerUp", { group: s.group });
  return side.thirdGroup
    ? t("bracket.source.third", { group: side.thirdGroup })
    : t("bracket.source.thirdOpen");
}

/**
 * Projizierte Paarungen EINER K.-o.-Runde als Karten-Raster (mobil 1-spaltig,
 * Desktop 2–3). Im Sechzehntelfinale zusätzlich die Herkunft je Team
 * (Sieger A / Zweiter B / 3. X); sonst der projizierte Sieger hervorgehoben.
 */
export function PhasePairings({
  proj,
  stage,
  teams,
  groupsDone,
  predIndex,
}: Props) {
  const { t } = useTranslation();
  const round = proj.rounds.find((r) => r.stage === stage);
  if (!round) return null;

  // Herkunft je Team nur im Sechzehntelfinale verfügbar.
  const sourceOf = new Map<string, string>();
  if (stage === "round32") {
    for (const tie of proj.round32) {
      for (const side of [tie.a, tie.b]) {
        if (side.teamId) sourceOf.set(side.teamId, sourceLabel(t, side));
      }
    }
  }

  // Echte (aufgelöste) K.-o.-Partien je Paarung → für den realen KI-Tipp.
  const realByPair = new Map<string, PredictionIndexEntry>();
  for (const e of predIndex?.entries ?? []) {
    if (e.stage === "group") continue;
    realByPair.set(pairKey(e.homeTeamId, e.awayTeamId), e);
  }

  return (
    <div className="space-y-3">
      {stage === "round32" && (
        <p className="text-xs text-fg-faint">
          {groupsDone
            ? t("groups.nextRoundFinal")
            : t("groups.nextRoundProjected")}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {round.matches.map((m, i) => {
          // Liegt die echte Auslosung vor, den realen KI-Tipp zeigen (Score +
          // Sieger + %), sonst die Elo-Projektion.
          const real = realByPair.get(pairKey(m.a, m.b));
          const tip = real ? tipDisplay(real, m.a) : null;
          const aGoals = tip ? tip.aGoals : m.score.a;
          const bGoals = tip ? tip.bGoals : m.score.b;
          const winner = tip ? tip.winner : m.winner;
          const winProb = tip ? tip.winProb : m.winProb;
          const advance = tip?.advance ?? false;
          return (
            <li
              key={i}
              className="min-w-0 overflow-hidden rounded-lg border border-edge bg-surface/40"
            >
              <PairLine
                teams={teams}
                id={m.a}
                goals={aGoals}
                win={winner === m.a}
                source={sourceOf.get(m.a)}
              />
              <div className="h-px bg-edge" />
              <PairLine
                teams={teams}
                id={m.b}
                goals={bGoals}
                win={winner === m.b}
                source={sourceOf.get(m.b)}
              />
              <div className="flex items-center justify-end gap-1 border-t border-edge/70 bg-surface-2/60 px-2 py-0.5">
                {advance && (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-acc/80">
                    {t("groups.advances")}
                  </span>
                )}
                <span className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">
                  {formatPercent(winProb)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PairLine({
  teams,
  id,
  goals,
  win,
  source,
}: {
  teams: Map<string, TeamSummary>;
  id: string;
  goals: number;
  win: boolean;
  source: string | undefined;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 ${win ? "bg-acc/10" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <TeamBadge team={teams.get(id)} fallbackId={id} size="sm" />
      </span>
      {source && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-fg-faint">
          {source}
        </span>
      )}
      <span
        className={`w-4 shrink-0 text-right font-mono text-sm font-bold ${
          win ? "text-acc" : "text-fg-faint"
        }`}
      >
        {goals}
      </span>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import type { TeamSummary } from "@wm/shared";
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
export function PhasePairings({ proj, stage, teams, groupsDone }: Props) {
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
        {round.matches.map((m, i) => (
          <li
            key={i}
            className="min-w-0 overflow-hidden rounded-lg border border-edge bg-surface/40"
          >
            <PairLine
              teams={teams}
              id={m.a}
              goals={m.score.a}
              win={m.winner === m.a}
              source={sourceOf.get(m.a)}
            />
            <div className="h-px bg-edge" />
            <PairLine
              teams={teams}
              id={m.b}
              goals={m.score.b}
              win={m.winner === m.b}
              source={sourceOf.get(m.b)}
            />
            <div className="flex items-center justify-end border-t border-edge/70 bg-surface-2/60 px-2 py-0.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">
                {formatPercent(m.winProb)}
              </span>
            </div>
          </li>
        ))}
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

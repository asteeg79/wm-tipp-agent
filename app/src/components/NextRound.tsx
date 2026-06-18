import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IndexFile, PredictionsIndex, TeamSummary } from "@wm/shared";
import {
  hasWc2026Structure,
  projectBracket,
  type ProjectedSide,
} from "../lib/simulate.js";
import { TeamBadge } from "./TeamBadge.js";

interface Props {
  index: IndexFile;
  predIndex: PredictionsIndex | undefined;
  teams: Map<string, TeamSummary>;
}

/**
 * „So geht's weiter": die 16 Sechzehntelfinal-Paarungen, projiziert aus dem
 * aktuellen Gruppenstand nach dem echten WM-2026-Schema. Erscheint nur, wenn
 * die volle Gruppenstruktur (A…L) vorliegt.
 */
export function NextRound({ index, predIndex, teams }: Props) {
  const { t } = useTranslation();

  const round32 = useMemo(
    () =>
      predIndex && hasWc2026Structure(index)
        ? projectBracket(index, predIndex).round32
        : null,
    [index, predIndex],
  );

  // Sind alle Gruppenspiele gespielt? → endgültige statt projizierte Paarungen.
  const groupsDone = useMemo(() => {
    const groupGames = (predIndex?.entries ?? []).filter(
      (e) => e.stage === "group",
    );
    return groupGames.length > 0 && groupGames.every((e) => !!e.actualResult);
  }, [predIndex]);

  if (!round32 || round32.length === 0) return null;

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h3 className="text-lg font-bold">{t("groups.nextRound")}</h3>
        <p className="mt-0.5 text-xs text-fg-faint">
          {groupsDone
            ? t("groups.nextRoundFinal")
            : t("groups.nextRoundProjected")}
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {round32.map((tie) => (
          <li
            key={tie.num}
            className="min-w-0 overflow-hidden rounded-lg border border-edge bg-surface/40"
          >
            <PairLine side={tie.a} teams={teams} />
            <div className="flex items-center justify-center bg-surface-2/60 py-0.5 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
              {t("groups.vs")}
            </div>
            <PairLine side={tie.b} teams={teams} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eine Seite einer Paarung: Team + Herkunfts-Label (Sieger A / Zweiter B / 3.). */
function PairLine({
  side,
  teams,
}: {
  side: ProjectedSide;
  teams: Map<string, TeamSummary>;
}) {
  const { t } = useTranslation();
  const s = side.source;
  const label =
    s.kind === "winner"
      ? t("bracket.source.winner", { group: s.group })
      : s.kind === "runnerUp"
        ? t("bracket.source.runnerUp", { group: s.group })
        : side.thirdGroup
          ? t("bracket.source.third", { group: side.thirdGroup })
          : t("bracket.source.thirdOpen");

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <span className="min-w-0 flex-1">
        <TeamBadge
          team={side.teamId ? teams.get(side.teamId) : undefined}
          fallbackId={side.teamId ?? "?"}
          size="sm"
        />
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-fg-faint">
        {label}
      </span>
    </div>
  );
}

import type { PotentialOpponent, TeamSummary } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { TeamBadge } from "./TeamBadge.js";

interface Props {
  opponents: PotentialOpponent[];
  teams: Map<string, TeamSummary>;
}

export function H2HBoxes({ opponents, teams }: Props) {
  const { t } = useTranslation();
  if (opponents.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {opponents.map((o) => {
        const h = o.h2hSummary;
        return (
          <div
            key={o.teamId}
            className="rounded-lg border border-edge bg-surface/40 p-3"
          >
            <div className="flex items-center justify-between gap-1 text-sm font-medium">
              <TeamBadge
                team={teams.get(o.teamId)}
                fallbackId={o.teamId}
                size="sm"
              />
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-fg-faint">
              {o.stage === "group" ? t("team.stageGroup") : t("team.stageKo")}
            </div>
            <div className="mt-2 flex justify-between text-xs text-fg-muted">
              <span title={t("team.played")}>
                {h.played} {t("team.played")}
              </span>
              <span className="font-mono">
                {h.w}/{h.d}/{h.l}
              </span>
              <span className="font-mono">
                {h.gf}:{h.ga}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

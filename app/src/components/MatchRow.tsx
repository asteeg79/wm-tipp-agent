import { Link } from "react-router-dom";
import type { PredictionIndexEntry, TeamSummary } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { TeamBadge } from "./TeamBadge.js";
import { formatKickoff } from "../lib/format.js";

interface Props {
  entry: PredictionIndexEntry;
  teams: Map<string, TeamSummary>;
}

export function MatchRow({ entry, teams }: Props) {
  const { t } = useTranslation();
  const home = teams.get(entry.homeTeamId);
  const away = teams.get(entry.awayTeamId);
  const r = entry.actualResult;
  const tip = entry.predictedScore;

  // Mittlere Score-Spalte: Ist-Ergebnis (fett) > KI-Tipp (gedämpft) > "vs".
  let scoreCell;
  if (r) {
    scoreCell = (
      <span className="font-semibold">
        {r.home}:{r.away}
      </span>
    );
  } else if (tip) {
    scoreCell = (
      <span className="text-fg-soft" title={t("overview.tip")}>
        {tip.home}:{tip.away}
      </span>
    );
  } else {
    scoreCell = <span className="text-fg-faint">vs</span>;
  }

  // Rechte Spalte: beendet · Konfidenz (wenn Tipp) · "Tipp folgt".
  let rightCell: string;
  if (r) rightCell = t("match.finished");
  else if (entry.confidence !== undefined)
    rightCell = `${Math.round(entry.confidence * 100)}%`;
  else rightCell = t("overview.tipSoon");

  return (
    <Link
      to={`/match/${entry.matchId}`}
      className="flex items-center gap-3 rounded-lg border border-edge bg-surface/40 px-3 py-2 hover:border-edge-strong"
    >
      <div className="w-28 shrink-0 text-xs text-fg-faint">
        {formatKickoff(entry.date)}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <TeamBadge
          team={home}
          fallbackId={entry.homeTeamId}
          link={false}
          align="right"
        />
      </div>
      <div className="shrink-0 px-2 text-center font-mono text-sm">
        {scoreCell}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamBadge team={away} fallbackId={entry.awayTeamId} link={false} />
      </div>
      <div className="hidden w-16 shrink-0 text-right text-xs text-fg-faint sm:block">
        {rightCell}
      </div>
    </Link>
  );
}

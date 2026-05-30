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

  return (
    <Link
      to={`/match/${entry.matchId}`}
      className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 hover:border-slate-700"
    >
      <div className="w-28 shrink-0 text-xs text-slate-500">
        {formatKickoff(entry.date)}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="min-w-0 truncate text-right">
          <TeamBadge team={home} fallbackId={entry.homeTeamId} link={false} />
        </span>
      </div>
      <div className="shrink-0 px-2 text-center font-mono text-sm">
        {r ? (
          <span className="font-semibold">
            {r.home}:{r.away}
          </span>
        ) : (
          <span className="text-slate-500">vs</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate">
          <TeamBadge team={away} fallbackId={entry.awayTeamId} link={false} />
        </span>
      </div>
      <div className="hidden w-16 shrink-0 text-right text-xs text-slate-600 sm:block">
        {r ? t("match.finished") : t("overview.tipSoon")}
      </div>
    </Link>
  );
}

import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatch, useTeamsMap } from "../lib/data.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { formatKickoff } from "../lib/format.js";

export function MatchPage() {
  const { matchId } = useParams();
  const { t } = useTranslation();
  const { data: match, isLoading, isError } = useMatch(matchId);
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !match) return <p className="text-red-400">{t("error")}</p>;

  const r = match.actualResult;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-center text-xs text-slate-500">
          {formatKickoff(match.date)} ·{" "}
          {match.status === "finished" ? t("match.finished") : t("match.scheduled")}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-lg font-semibold">
          <div className="flex-1 text-right">
            <TeamBadge team={teams.get(match.homeTeamId)} fallbackId={match.homeTeamId} />
          </div>
          <div className="font-mono text-2xl">
            {r ? `${r.home}:${r.away}` : "–"}
          </div>
          <div className="flex-1 text-left">
            <TeamBadge team={teams.get(match.awayTeamId)} fallbackId={match.awayTeamId} />
          </div>
        </div>
        <div className="mt-3 text-center text-xs text-slate-500">
          {t("match.venue")}: {match.venue.city}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-4 text-sm text-slate-400">
        {t("match.predictionSoon")}
      </div>
    </div>
  );
}

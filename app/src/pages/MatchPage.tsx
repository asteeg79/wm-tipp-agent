import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatch, useTeamsMap } from "../lib/data.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { ProbabilityBar } from "../components/ProbabilityBar.js";
import { ConfidenceBadge } from "../components/ConfidenceBadge.js";
import { formatKickoff } from "../lib/format.js";

export function MatchPage() {
  const { matchId } = useParams();
  const { t } = useTranslation();
  const { data: match, isLoading, isError } = useMatch(matchId);
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !match) return <p className="text-red-400">{t("error")}</p>;

  const r = match.actualResult;
  const pred = match.prediction;
  const fb = match.featureBundle;
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);

  return (
    <div className="space-y-4">
      {/* Kopf: Paarung + Ergebnis/Tipp */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-center text-xs text-slate-500">
          {formatKickoff(match.date)} ·{" "}
          {match.status === "finished"
            ? t("match.finished")
            : t("match.scheduled")}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-lg font-semibold">
          <div className="flex-1 text-right">
            <TeamBadge team={home} fallbackId={match.homeTeamId} />
          </div>
          <div className="font-mono text-2xl">
            {r
              ? `${r.home}:${r.away}`
              : pred
                ? `${pred.predictedScore.home}:${pred.predictedScore.away}`
                : "–"}
          </div>
          <div className="flex-1 text-left">
            <TeamBadge team={away} fallbackId={match.awayTeamId} />
          </div>
        </div>
        {!r && pred && (
          <div className="mt-1 text-center text-[11px] uppercase tracking-wide text-slate-500">
            {t("match.tip")}
          </div>
        )}
        <div className="mt-3 text-center text-xs text-slate-500">
          {t("match.venue")}: {match.venue.city}
          {match.venue.altitude
            ? ` · ${t("match.altitude")} ${match.venue.altitude} m`
            : ""}
        </div>
      </div>

      {/* Prognose (Baseline) */}
      {pred ? (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("match.baselineTip")}</h3>
            <ConfidenceBadge value={pred.confidence} />
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
              {t("match.probabilities")}
            </div>
            <ProbabilityBar p={pred.probabilities} />
          </div>

          {pred.baseline && (
            <div className="text-sm text-slate-400">
              {t("match.expectedGoals")}:{" "}
              <span className="font-mono text-slate-200">
                {pred.baseline.expectedGoals.home.toFixed(2)} :{" "}
                {pred.baseline.expectedGoals.away.toFixed(2)}
              </span>
            </div>
          )}

          {fb && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-sm">
              <FeatureCol label={home?.name ?? match.homeTeamId} f={fb.home} />
              <FeatureCol label={away?.name ?? match.awayTeamId} f={fb.away} />
            </div>
          )}

          <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
            {t("match.baselineNote")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-4 text-sm text-slate-400">
          {t("match.predictionSoon")}
        </div>
      )}
    </div>
  );
}

function FeatureCol({
  label,
  f,
}: {
  label: string;
  f: { elo: number; weightedForm: number };
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="truncate font-medium">{label}</div>
      <div className="mt-1 flex justify-between text-slate-400">
        <span>{t("match.elo")}</span>
        <span className="font-mono">{f.elo}</span>
      </div>
      <div className="flex justify-between text-slate-400">
        <span>{t("match.form")}</span>
        <span className="font-mono">{f.weightedForm.toFixed(2)}</span>
      </div>
    </div>
  );
}

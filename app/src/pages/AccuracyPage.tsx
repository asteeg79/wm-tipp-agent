import { useTranslation } from "react-i18next";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { StatCard } from "../components/StatCard.js";
import { TeamBadge } from "../components/TeamBadge.js";

export function AccuracyPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !data) return <p className="text-red-400">{t("error")}</p>;

  const agg = data.aggregate;
  const pct = (x: number | null): string =>
    x === null ? "–" : `${Math.round(x * 100)}%`;
  const num = (x: number | null): string => (x === null ? "–" : x.toFixed(3));

  const finishedEntries = data.entries
    .filter((e) => e.actualResult && e.accuracy)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t("accuracy.title")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("accuracy.intro")}</p>
      </div>

      {agg.finishedCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-slate-400">
          {t("accuracy.none")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label={t("accuracy.finished")}
              value={String(agg.finishedCount)}
            />
            <StatCard
              label={t("accuracy.outcomeRate")}
              value={pct(agg.outcomeRate)}
              accent="emerald"
            />
            <StatCard
              label={t("accuracy.exactRate")}
              value={pct(agg.exactScoreRate)}
              accent="sky"
            />
            <StatCard
              label={t("accuracy.brier")}
              value={num(agg.brierMean)}
              hint={t("accuracy.lower")}
              accent="amber"
            />
            <StatCard
              label={t("accuracy.rps")}
              value={num(agg.rpsMean)}
              hint={t("accuracy.lower")}
              accent="amber"
            />
          </div>

          <div>
            <h3 className="mb-2 font-semibold">{t("accuracy.recent")}</h3>
            <ul className="divide-y divide-slate-800/70 rounded-xl border border-slate-800 bg-slate-900/40">
              {finishedEntries.map((e) => {
                const a = e.accuracy!;
                return (
                  <li
                    key={e.matchId}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-right">
                      <TeamBadge team={teams.get(e.homeTeamId)} fallbackId={e.homeTeamId} link={false} />
                    </span>
                    <span className="shrink-0 font-mono">
                      {e.actualResult!.home}:{e.actualResult!.away}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <TeamBadge team={teams.get(e.awayTeamId)} fallbackId={e.awayTeamId} link={false} />
                    </span>
                    <span className="shrink-0">
                      {a.exactScoreHit ? (
                        <span className="text-emerald-400" title={t("accuracy.exactRate")}>★</span>
                      ) : a.outcomeHit ? (
                        <span className="text-amber-400" title={t("accuracy.outcomeRate")}>✓</span>
                      ) : (
                        <span className="text-red-400">✗</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

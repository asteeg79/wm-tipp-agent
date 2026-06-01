import { useTranslation } from "react-i18next";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { useUserTips, tipPoints } from "../lib/userTips.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { formatKickoff } from "../lib/format.js";

export function PlayPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();
  const { tips, setTip, clear } = useUserTips();

  if (isLoading) return <p className="text-fg-muted">{t("loading")}</p>;
  if (isError || !data) return <p className="text-neg">{t("error")}</p>;

  // Punktestand über alle beendeten Partien.
  let userPts = 0;
  let aiPts = 0;
  for (const e of data.entries) {
    if (!e.actualResult) continue;
    const ut = tips[e.matchId];
    if (ut) userPts += tipPoints(ut, e.actualResult);
    if (e.predictedScore) aiPts += tipPoints(e.predictedScore, e.actualResult);
  }

  const open = data.entries
    .filter((e) => !e.actualResult)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 40);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{t("play.title")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("play.intro")}</p>
        </div>
        <button
          onClick={clear}
          className="rounded-md border border-edge-strong px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-2"
        >
          {t("play.reset")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-edge bg-surface/40 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-fg-faint">
            {t("play.yourPoints")}
          </div>
          <div className="mt-1 text-2xl font-bold text-pos">
            {userPts}
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-surface/40 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-fg-faint">
            {t("play.aiPoints")}
          </div>
          <div className="mt-1 text-2xl font-bold text-info">{aiPts}</div>
        </div>
      </div>
      <p className="text-center text-xs text-fg-faint">{t("play.rules")}</p>

      {open.length === 0 ? (
        <p className="text-fg-faint">{t("play.noUpcoming")}</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((e) => {
            const ut = tips[e.matchId];
            return (
              <li
                key={e.matchId}
                className="flex items-center gap-2 rounded-lg border border-edge bg-surface/40 px-3 py-2 text-sm"
              >
                <span className="w-24 shrink-0 text-xs text-fg-faint">
                  {formatKickoff(e.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-right">
                  <TeamBadge team={teams.get(e.homeTeamId)} fallbackId={e.homeTeamId} link={false} />
                </span>
                <ScoreInput
                  value={ut?.home}
                  onChange={(v) =>
                    setTip(e.matchId, { home: v, away: ut?.away ?? 0 })
                  }
                />
                <span className="text-fg-faint">:</span>
                <ScoreInput
                  value={ut?.away}
                  onChange={(v) =>
                    setTip(e.matchId, { home: ut?.home ?? 0, away: v })
                  }
                />
                <span className="min-w-0 flex-1 truncate">
                  <TeamBadge team={teams.get(e.awayTeamId)} fallbackId={e.awayTeamId} link={false} />
                </span>
                <span className="hidden w-16 shrink-0 text-right text-[11px] text-fg-faint sm:block">
                  {e.predictedScore
                    ? `KI ${e.predictedScore.home}:${e.predictedScore.away}`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ScoreInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <input
      type="number"
      min={0}
      max={20}
      value={value ?? ""}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!Number.isNaN(v) && v >= 0) onChange(v);
      }}
      className="w-10 rounded border border-edge-strong bg-surface px-1 py-0.5 text-center font-mono"
    />
  );
}

import { useTranslation } from "react-i18next";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { MatchCard } from "../components/MatchCard.js";
import { Scorebug } from "../components/Scorebug.js";
import { formatKickoff } from "../lib/format.js";

export function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-fg-muted">{t("loading")}</p>;
  if (isError || !data) return <p className="text-neg">{t("error")}</p>;

  const now = Date.now();
  const byDateAsc = [...data.entries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Nächste anstehende Partien (kein Ergebnis, Anpfiff in der Zukunft).
  const upcoming = byDateAsc.filter(
    (e) => e.actualResult === null && new Date(e.date).getTime() >= now,
  );
  const upcomingList = upcoming.length > 0 ? upcoming : byDateAsc.slice(0, 6);

  // Held = nächste Partie mit vollständigem KI-Tipp; sonst die erste.
  const featured =
    upcomingList.find((e) => e.predictedScore && e.probabilities) ??
    upcomingList[0];
  const rest = upcomingList
    .filter((e) => e.matchId !== featured?.matchId)
    .slice(0, 5);

  // Letzte 2 beendete Partien (mit Ergebnis), neueste zuerst.
  const recent = byDateAsc
    .filter((e) => e.actualResult !== null)
    .slice(-2)
    .reverse();

  return (
    <section className="space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-acc">
          {t("overview.kicker")}
        </div>
        <h2 className="mt-1 text-xl font-bold">{t("overview.today")}</h2>
      </div>

      {featured && <Scorebug entry={featured} teams={teams} />}

      {rest.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
            {t("overview.upcoming")}
          </h3>
          {rest.map((e) => (
            <Scorebug
              key={e.matchId}
              entry={e}
              teams={teams}
              label={formatKickoff(e.date)}
            />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
            {t("overview.recent")}
          </h3>
          {recent.map((e) => (
            <MatchCard key={e.matchId} entry={e} teams={teams} />
          ))}
        </div>
      )}
    </section>
  );
}

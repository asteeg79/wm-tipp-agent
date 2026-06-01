import { useTranslation } from "react-i18next";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { MatchCard } from "../components/MatchCard.js";

export function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !data) return <p className="text-red-400">{t("error")}</p>;

  const now = Date.now();
  const byDateAsc = [...data.entries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Nächste 3 anstehende Partien (kein Ergebnis, Anpfiff in der Zukunft).
  const upcoming = byDateAsc
    .filter((e) => e.actualResult === null && new Date(e.date).getTime() >= now)
    .slice(0, 3);

  // Falls noch keine zukünftigen Partien existieren: die 3 frühesten zeigen.
  const upcomingList = upcoming.length > 0 ? upcoming : byDateAsc.slice(0, 3);

  // Letzte 2 beendete Partien (mit Ergebnis), neueste zuerst.
  const recent = byDateAsc
    .filter((e) => e.actualResult !== null)
    .slice(-2)
    .reverse();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t("appTitle")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("tagline")}</p>
      </div>

      {/* Nächste Spiele */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          {t("overview.upcoming")}
        </h3>
        {upcomingList.length === 0 ? (
          <p className="text-slate-500">{t("overview.empty")}</p>
        ) : (
          upcomingList.map((e) => (
            <MatchCard key={e.matchId} entry={e} teams={teams} />
          ))
        )}
      </div>

      {/* Zuletzt gespielt — Ist-Ergebnis vs. KI-Tipp */}
      {recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
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

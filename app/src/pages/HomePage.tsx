import { useTranslation } from "react-i18next";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { MatchRow } from "../components/MatchRow.js";

export function HomePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !data)
    return <p className="text-red-400">{t("error")}</p>;

  const now = Date.now();
  const upcoming = data.entries
    .filter((e) => e.actualResult === null && new Date(e.date).getTime() >= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Fallback: falls (noch) keine zukünftigen → einfach alle chronologisch.
  const list = (upcoming.length > 0 ? upcoming : data.entries).slice(0, 30);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t("overview.title")}</h2>
        <p className="mt-1 text-sm text-slate-400">{t("tagline")}</p>
      </div>

      {list.length === 0 ? (
        <p className="text-slate-500">{t("overview.empty")}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((e) => (
            <MatchRow key={e.matchId} entry={e} teams={teams} />
          ))}
        </div>
      )}
    </section>
  );
}

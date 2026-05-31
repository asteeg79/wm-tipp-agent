import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTeam, useTeamsMap } from "../lib/data.js";
import { FormChart } from "../components/FormChart.js";
import { ResultsList } from "../components/ResultsList.js";
import { H2HBoxes } from "../components/H2HBoxes.js";
import { NewsList } from "../components/NewsList.js";
import { FavoriteToggle } from "../components/FavoriteToggle.js";
import { useFavorites } from "../lib/FavoritesContext.js";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function TeamPage() {
  const { teamId } = useParams();
  const { t } = useTranslation();
  const { data: team, isLoading, isError } = useTeam(teamId);
  const teams = useTeamsMap();
  const { isFavorite, toggle } = useFavorites();

  if (isLoading) return <p className="text-slate-400">{t("loading")}</p>;
  if (isError || !team) return <p className="text-red-400">{t("error")}</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        {team.logo && (
          <img src={team.logo} alt="" className="h-8 w-auto rounded-sm" />
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{team.name}</h2>
          <p className="text-sm text-slate-500">
            {team.code} · {t("team.group")} {team.groupId}
          </p>
        </div>
        <FavoriteToggle
          isFavorite={isFavorite(team.id)}
          onToggle={() => toggle(team.id)}
        />
      </header>

      <Section title={t("team.form")}>
        <FormChart results={team.results} />
      </Section>

      <Section title={t("team.h2h")}>
        <H2HBoxes opponents={team.potentialOpponents} teams={teams} />
      </Section>

      <Section title={t("team.results")}>
        <ResultsList results={team.results} />
      </Section>

      <Section title={t("team.news")}>
        <NewsList news={team.news} />
      </Section>
    </div>
  );
}

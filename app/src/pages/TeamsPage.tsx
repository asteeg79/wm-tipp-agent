import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TeamSummary } from "@wm/shared";
import { useTeamsMap } from "../lib/data.js";
import { useFavorites } from "../lib/FavoritesContext.js";

/** Team-Auswahlliste: Favoriten oben angepinnt, dann alphabetisch.
 *  Tippen öffnet die Team-Detailansicht (/team/:id). */
export function TeamsPage() {
  const { t } = useTranslation();
  const teams = useTeamsMap();
  const { favorites, toggle } = useFavorites();
  const [q, setQ] = useState("");

  const { favList, restList } = useMemo(() => {
    const all = [...teams.values()];
    const needle = q.trim().toLowerCase();
    const match = (x: TeamSummary): boolean =>
      !needle ||
      x.name.toLowerCase().includes(needle) ||
      x.code.toLowerCase().includes(needle);
    const filtered = all.filter(match);
    const byName = (a: TeamSummary, b: TeamSummary): number =>
      a.name.localeCompare(b.name);
    return {
      favList: filtered.filter((x) => favorites.has(x.id)).sort(byName),
      restList: filtered.filter((x) => !favorites.has(x.id)).sort(byName),
    };
  }, [teams, favorites, q]);

  if (teams.size === 0) return <p className="text-fg-muted">{t("loading")}</p>;

  return (
    <section className="space-y-4">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-acc">
          {t("teams.kicker")}
        </div>
        <h2 className="mt-1 text-xl font-bold">{t("teams.title")}</h2>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("teams.search")}
        className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-acc focus:outline-none"
      />

      {favList.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-acc">
            ★ {t("teams.favorites")}
          </div>
          {favList.map((team) => (
            <TeamItem
              key={team.id}
              team={team}
              isFav
              onToggle={() => toggle(team.id)}
            />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {favList.length > 0 && (
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
            {t("teams.all")}
          </div>
        )}
        {restList.map((team) => (
          <TeamItem
            key={team.id}
            team={team}
            isFav={false}
            onToggle={() => toggle(team.id)}
          />
        ))}
        {favList.length === 0 && restList.length === 0 && (
          <p className="text-sm text-fg-faint">{t("teams.none")}</p>
        )}
      </div>
    </section>
  );
}

function TeamItem({
  team,
  isFav,
  onToggle,
}: {
  team: TeamSummary;
  isFav: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2.5">
      <Link
        to={`/team/${team.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {team.logo ? (
          <img
            src={team.logo}
            alt=""
            className="h-4 w-auto shrink-0 rounded-[2px] object-cover"
            loading="lazy"
          />
        ) : (
          <span className="h-4 w-6 shrink-0 rounded-[2px] bg-surface-2" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-fg">
            {team.name}
          </span>
          <span className="font-mono text-[11px] text-fg-faint">
            {team.code} · {team.groupId}
          </span>
        </span>
      </Link>
      <button
        onClick={onToggle}
        aria-pressed={isFav}
        title={isFav ? "★" : "☆"}
        className={`shrink-0 px-1.5 text-lg leading-none ${
          isFav ? "text-acc" : "text-fg-faint hover:text-fg-soft"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>
    </div>
  );
}

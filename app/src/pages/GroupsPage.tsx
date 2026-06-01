import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PredictionIndexEntry } from "@wm/shared";
import { useIndex, usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { MatchRow } from "../components/MatchRow.js";

export function GroupsPage() {
  const { t } = useTranslation();
  const { data: index, isLoading, isError } = useIndex();
  const { data: predIndex } = usePredictionsIndex();
  const teams = useTeamsMap();
  const [teamFilter, setTeamFilter] = useState("");

  // Match-Liste je Gruppe (Gruppe = Gruppe des Heimteams).
  const matchesByGroup = useMemo(() => {
    const m = new Map<string, PredictionIndexEntry[]>();
    for (const e of predIndex?.entries ?? []) {
      const gid = teams.get(e.homeTeamId)?.groupId;
      if (!gid) continue;
      if (!m.has(gid)) m.set(gid, []);
      m.get(gid)!.push(e);
    }
    return m;
  }, [predIndex, teams]);

  if (isLoading) return <p className="text-fg-muted">{t("loading")}</p>;
  if (isError || !index) return <p className="text-neg">{t("error")}</p>;

  const sortedTeams = [...index.teams].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const visibleGroups = teamFilter
    ? index.groups.filter((g) => g.teamIds.includes(teamFilter))
    : index.groups;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t("groups.title")}</h2>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="rounded-md border border-edge-strong bg-surface px-2 py-1 text-sm"
        >
          <option value="">{t("groups.all")}</option>
          {sortedTeams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleGroups.map((g) => {
          const groupTeams = g.teamIds
            .map((id) => teams.get(id))
            .filter((x): x is NonNullable<typeof x> => !!x)
            .sort((a, b) => a.name.localeCompare(b.name));
          let matches = matchesByGroup.get(g.id) ?? [];
          if (teamFilter)
            matches = matches.filter(
              (m) =>
                m.homeTeamId === teamFilter || m.awayTeamId === teamFilter,
            );

          return (
            <div
              key={g.id}
              className="rounded-xl border border-edge bg-surface/40 p-4"
            >
              <h3 className="mb-2 font-semibold">
                {t("groups.group", { id: g.id })}
              </h3>
              <ul className="mb-3 grid grid-cols-2 gap-1.5 text-sm">
                {groupTeams.map((tm) => (
                  <li key={tm.id}>
                    <TeamBadge team={tm} />
                  </li>
                ))}
              </ul>
              {matches.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-fg-faint">
                    {t("groups.matches")}
                  </div>
                  {matches.map((e) => (
                    <MatchRow key={e.matchId} entry={e} teams={teams} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

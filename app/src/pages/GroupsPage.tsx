import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PredictionIndexEntry } from "@wm/shared";
import { useIndex, usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { MatchRow } from "../components/MatchRow.js";
import { simulateTournament } from "../lib/simulate.js";

const SIM_RUNS = 5000;

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

  // Weiterkommens-/Gruppensieg-Wahrscheinlichkeiten (Monte-Carlo, gecacht).
  const sim = useMemo(
    () =>
      index && predIndex
        ? simulateTournament(index, predIndex, SIM_RUNS)
        : null,
    [index, predIndex],
  );
  const pct = (x: number | undefined): string =>
    x === undefined ? "–" : `${Math.round(x * 100)}%`;

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
            // Nach Weiterkommens-Wahrscheinlichkeit sortieren (sonst alphabetisch).
            .sort((a, b) =>
              sim
                ? (sim.advance.get(b.id) ?? 0) - (sim.advance.get(a.id) ?? 0)
                : a.name.localeCompare(b.name),
            );
          let matches = matchesByGroup.get(g.id) ?? [];
          if (teamFilter)
            matches = matches.filter(
              (m) => m.homeTeamId === teamFilter || m.awayTeamId === teamFilter,
            );

          return (
            <div
              key={g.id}
              className="rounded-xl border border-edge bg-surface/40 p-4"
            >
              <h3 className="mb-2 font-semibold">
                {t("groups.group", { id: g.id })}
              </h3>
              <ul className="mb-3 space-y-1 text-sm">
                {sim && (
                  <li className="flex items-center justify-between text-[10px] uppercase tracking-wide text-fg-faint">
                    <span>{t("groups.team")}</span>
                    <span className="flex gap-3 font-mono">
                      <span className="w-10 text-right">
                        {t("bracket.groupWinnerShort")}
                      </span>
                      <span className="w-10 text-right">
                        {t("bracket.advanceShort")}
                      </span>
                    </span>
                  </li>
                )}
                {groupTeams.map((tm) => (
                  <li key={tm.id} className="flex items-center justify-between">
                    <TeamBadge team={tm} />
                    {sim && (
                      <span className="flex shrink-0 gap-3 font-mono text-xs">
                        <span className="w-10 text-right text-fg-muted">
                          {pct(sim.groupWinner.get(tm.id))}
                        </span>
                        <span className="w-10 text-right font-semibold text-pos">
                          {pct(sim.advance.get(tm.id))}
                        </span>
                      </span>
                    )}
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

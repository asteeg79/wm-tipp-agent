import { formatPercent, pointsFor } from "../lib/format.js";
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

  // Echte Gruppen-Tabelle aus den IST-Ergebnissen (nur Gruppenspiele):
  // Spiele, Tore, Gegentore, Punkte je Team.
  const standingsByTeam = useMemo(() => {
    const m = new Map<
      string,
      { played: number; gf: number; ga: number; pts: number }
    >();
    for (const e of predIndex?.entries ?? []) {
      if (e.stage !== "group" || !e.actualResult) continue;
      const r = e.actualResult;
      const sides = [
        [e.homeTeamId, r.home, r.away],
        [e.awayTeamId, r.away, r.home],
      ] as const;
      for (const [id, gf, ga] of sides) {
        const s = m.get(id) ?? { played: 0, gf: 0, ga: 0, pts: 0 };
        s.played++;
        s.gf += gf;
        s.ga += ga;
        s.pts += pointsFor(gf, ga);
        m.set(id, s);
      }
    }
    return m;
  }, [predIndex]);

  const NULL_STANDING = { played: 0, gf: 0, ga: 0, pts: 0 };

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
          const standingOf = (id: string) =>
            standingsByTeam.get(id) ?? NULL_STANDING;
          const groupTeams = g.teamIds
            .map((id) => teams.get(id))
            .filter((x): x is NonNullable<typeof x> => !!x)
            // FIFA-Sortierung nach IST-Ergebnissen: Punkte → Tordifferenz →
            // erzielte Tore; bei Gleichstand (z. B. vor dem 1. Spieltag)
            // entscheidet die simulierte Weiterkommens-Wahrscheinlichkeit.
            .sort((a, b) => {
              const sa = standingOf(a.id);
              const sb = standingOf(b.id);
              if (sb.pts !== sa.pts) return sb.pts - sa.pts;
              const gdDiff = sb.gf - sb.ga - (sa.gf - sa.ga);
              if (gdDiff !== 0) return gdDiff;
              if (sb.gf !== sa.gf) return sb.gf - sa.gf;
              return sim
                ? (sim.advance.get(b.id) ?? 0) - (sim.advance.get(a.id) ?? 0)
                : a.name.localeCompare(b.name);
            });
          let matches = matchesByGroup.get(g.id) ?? [];
          if (teamFilter)
            matches = matches.filter(
              (m) => m.homeTeamId === teamFilter || m.awayTeamId === teamFilter,
            );

          return (
            <div
              key={g.id}
              className="min-w-0 overflow-hidden rounded-xl border border-edge bg-surface/40 p-4"
            >
              <h3 className="mb-2 font-semibold">
                {t("groups.group", { id: g.id })}
              </h3>
              <ul className="mb-3 space-y-1 text-sm">
                <li className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-fg-faint">
                  <span className="w-4 shrink-0" />
                  <span className="min-w-0 flex-1">{t("groups.team")}</span>
                  <span className="flex shrink-0 gap-2 font-mono">
                    <span className="w-10 text-right">{t("groups.goals")}</span>
                    <span className="w-7 text-right">{t("groups.pts")}</span>
                    {sim && (
                      <>
                        <span className="hidden w-10 text-right sm:block">
                          {t("bracket.groupWinnerShort")}
                        </span>
                        <span className="w-10 text-right">
                          {t("bracket.advanceShort")}
                        </span>
                      </>
                    )}
                  </span>
                </li>
                {groupTeams.map((tm, pos) => {
                  const s = standingOf(tm.id);
                  return (
                    <li
                      key={tm.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-xs text-fg-faint">
                        {pos + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <TeamBadge team={tm} />
                      </span>
                      <span className="flex shrink-0 gap-2 font-mono text-xs">
                        <span className="w-10 text-right text-fg-muted">
                          {s.gf}:{s.ga}
                        </span>
                        <span className="w-7 text-right font-semibold">
                          {s.pts}
                        </span>
                        {sim && (
                          <>
                            <span className="hidden w-10 text-right text-fg-muted sm:block">
                              {formatPercent(sim.groupWinner.get(tm.id))}
                            </span>
                            <span className="w-10 text-right font-semibold text-pos">
                              {formatPercent(sim.advance.get(tm.id))}
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
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

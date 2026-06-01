import type { TeamResult } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { formatDate, pointsFor } from "../lib/format.js";

const outcomeColor = (gf: number, ga: number): string => {
  const p = pointsFor(gf, ga);
  if (p === 3) return "text-pos";
  if (p === 1) return "text-warn";
  return "text-neg";
};

export function ResultsList({ results }: { results: TeamResult[] }) {
  const { t } = useTranslation();
  if (results.length === 0)
    return <p className="text-sm text-fg-faint">{t("team.noResults")}</p>;

  // Neueste zuerst.
  const sorted = [...results].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ul className="divide-y divide-edge/70">
      {sorted.map((r) => (
        <li
          key={r.matchId}
          className={`flex items-center gap-3 px-2 py-2 text-sm ${
            r.isVsPotentialWcOpponent
              ? "rounded-md bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
              : ""
          }`}
        >
          <span className="w-20 shrink-0 text-xs text-fg-faint">
            {formatDate(r.date)}
          </span>
          <span className="hidden w-36 shrink-0 truncate text-xs text-fg-faint sm:block">
            {r.competition}
          </span>
          <span className="w-4 shrink-0 text-center text-xs text-fg-faint">
            {r.home ? "H" : "A"}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {r.opponentName}
            {r.isVsPotentialWcOpponent && (
              <span
                className="ml-2 align-middle text-pos"
                title={t("team.vsWcOpponent")}
              >
                ★
              </span>
            )}
          </span>
          <span
            className={`shrink-0 font-mono font-semibold ${outcomeColor(
              r.goalsFor,
              r.goalsAgainst,
            )}`}
          >
            {r.goalsFor}:{r.goalsAgainst}
          </span>
        </li>
      ))}
    </ul>
  );
}

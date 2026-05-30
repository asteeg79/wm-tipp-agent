import { Link } from "react-router-dom";
import type { TeamSummary } from "@wm/shared";

interface Props {
  team: TeamSummary | undefined;
  /** Fallback-Anzeige, falls Team unbekannt (z. B. KO-Platzhalter). */
  fallbackId?: string;
  size?: "sm" | "md";
  link?: boolean;
}

export function TeamBadge({ team, fallbackId, size = "md", link = true }: Props) {
  const label = team?.name ?? fallbackId ?? "?";
  const flagH = size === "sm" ? "h-3.5" : "h-4";
  const content = (
    <span className="inline-flex items-center gap-2">
      {team?.logo ? (
        <img
          src={team.logo}
          alt=""
          className={`${flagH} w-auto rounded-[2px] object-cover`}
          loading="lazy"
        />
      ) : (
        <span className={`${flagH} w-5 rounded-[2px] bg-slate-700`} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );

  if (link && team) {
    return (
      <Link
        to={`/team/${team.id}`}
        className="text-slate-100 hover:text-emerald-400"
      >
        {content}
      </Link>
    );
  }
  return <span className="text-slate-300">{content}</span>;
}

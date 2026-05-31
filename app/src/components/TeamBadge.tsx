import { Link } from "react-router-dom";
import type { TeamSummary } from "@wm/shared";

interface Props {
  team: TeamSummary | undefined;
  /** Fallback-Anzeige, falls Team unbekannt (z. B. KO-Platzhalter). */
  fallbackId?: string;
  size?: "sm" | "md";
  link?: boolean;
  /** "right" stellt die Flagge rechts vom Namen (für Heim-Seite in Listen). */
  align?: "left" | "right";
}

export function TeamBadge({
  team,
  fallbackId,
  size = "md",
  link = true,
  align = "left",
}: Props) {
  const label = team?.name ?? fallbackId ?? "?";
  const flagH = size === "sm" ? "h-3.5" : "h-4";
  const flag = team?.logo ? (
    <img
      src={team.logo}
      alt=""
      className={`${flagH} w-auto shrink-0 rounded-[2px] object-cover`}
      loading="lazy"
    />
  ) : (
    <span className={`${flagH} w-5 shrink-0 rounded-[2px] bg-slate-700`} />
  );

  const content = (
    <span
      className={`flex min-w-0 items-center gap-2 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {flag}
      <span className="truncate">{label}</span>
    </span>
  );

  if (link && team) {
    return (
      <Link
        to={`/team/${team.id}`}
        className="min-w-0 text-slate-100 hover:text-emerald-400"
      >
        {content}
      </Link>
    );
  }
  return <span className="min-w-0 text-slate-300">{content}</span>;
}

import type { NewsItem, TeamSummary } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { useTeam } from "../lib/data.js";
import { formatDate } from "../lib/format.js";

const impactColor: Record<string, string> = {
  injury: "bg-red-500/15 text-neg",
  suspension: "bg-orange-500/15 text-orange-300",
  coach: "bg-blue-500/15 text-blue-300",
  morale: "bg-purple-500/15 text-purple-300",
  none: "bg-surface-2/40 text-fg-muted",
};

/** News-Item, angereichert um das zugehörige Team. */
type TaggedNews = NewsItem & { team: TeamSummary | undefined; teamId: string };

/** Wie viele News-Karten maximal angezeigt werden (beide Teams zusammen). */
const MAX_ITEMS = 6;

/**
 * "News zur Partie": führt die News BEIDER Teams zusammen, sortiert
 * materielle Meldungen (Verletzung/Sperre/Trainer) zuerst, dann nach
 * Aktualität. Jede Karte trägt eine Team-Kennung; der Titel öffnet den
 * Artikel in einem neuen Tab. So liest es sich als eine Nachrichtenlage
 * zum Spiel statt als zwei getrennte Teamlisten.
 */
export function MatchNews({
  homeTeamId,
  awayTeamId,
  teams,
}: {
  homeTeamId: string;
  awayTeamId: string;
  teams: Map<string, TeamSummary>;
}) {
  const { t } = useTranslation();
  const homeQ = useTeam(homeTeamId);
  const awayQ = useTeam(awayTeamId);

  if (homeQ.isLoading || awayQ.isLoading) {
    return (
      <Section title={t("match.newsTitle")}>
        <p className="text-sm text-fg-faint">{t("loading")}</p>
      </Section>
    );
  }

  const tag = (items: NewsItem[] | undefined, id: string): TaggedNews[] =>
    (items ?? []).map((n) => ({ ...n, team: teams.get(id), teamId: id }));

  const merged: TaggedNews[] = [
    ...tag(homeQ.data?.news, homeTeamId),
    ...tag(awayQ.data?.news, awayTeamId),
  ].sort((a, b) => {
    // Materielle News zuerst, dann neueste.
    const am = a.impactTag !== "none" ? 1 : 0;
    const bm = b.impactTag !== "none" ? 1 : 0;
    if (am !== bm) return bm - am;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  return (
    <Section title={t("match.newsTitle")}>
      {merged.length === 0 ? (
        <p className="text-sm text-fg-faint">{t("match.newsEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {merged.slice(0, MAX_ITEMS).map((n, i) => (
            <li
              key={`${n.url}-${i}`}
              className="rounded-lg border border-edge bg-surface/40 p-3"
            >
              <div className="mb-1 flex items-center gap-1.5">
                {n.team?.logo && (
                  <img
                    src={n.team.logo}
                    alt=""
                    className="h-3 w-auto rounded-[1px]"
                    loading="lazy"
                  />
                )}
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                  {n.team?.code ?? n.teamId}
                </span>
                {n.impactTag !== "none" && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${impactColor[n.impactTag] ?? ""}`}
                  >
                    {n.impactTag}
                  </span>
                )}
              </div>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-pos"
              >
                {n.title}
              </a>
              <div className="mt-1 flex items-center gap-2 text-xs text-fg-faint">
                <span>{n.source}</span>
                <span>·</span>
                <span>{formatDate(n.publishedAt)}</span>
              </div>
              {n.snippet && (
                <p className="mt-1 text-sm text-fg-muted">{n.snippet}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-edge bg-surface/40 p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

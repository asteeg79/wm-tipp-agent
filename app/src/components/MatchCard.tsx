import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type {
  NewsItem,
  PredictionIndexEntry,
  ScoreLine,
  TeamSummary,
} from "@wm/shared";
import { useMatch, useTeam } from "../lib/data.js";
import { TeamBadge } from "./TeamBadge.js";
import { ProbabilityBar } from "./ProbabilityBar.js";
import { ConfidenceBadge } from "./ConfidenceBadge.js";
import { NewsList } from "./NewsList.js";
import { formatKickoff } from "../lib/format.js";

interface Props {
  entry: PredictionIndexEntry;
  teams: Map<string, TeamSummary>;
}

/** Tendenz (1X2) zweier Scores gleich? */
function sameTendency(a: ScoreLine, b: ScoreLine): boolean {
  return Math.sign(a.home - a.away) === Math.sign(b.home - b.away);
}

/** Erweiterbarer Spiel-Kasten: Kopf mit Tipp/Kerninfos, aufklappbar Details. */
export function MatchCard({ entry, teams }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const home = teams.get(entry.homeTeamId);
  const away = teams.get(entry.awayTeamId);
  const r = entry.actualResult;
  const pred = entry.predictedScore;

  // Trefferanzeige für beendete Partien.
  let hitBadge: { label: string; cls: string } | null = null;
  if (r && pred) {
    if (r.home === pred.home && r.away === pred.away)
      hitBadge = { label: t("overview.exactHit"), cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" };
    else if (sameTendency(r, pred))
      hitBadge = { label: t("overview.hit"), cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" };
    else
      hitBadge = { label: t("overview.miss"), cls: "bg-red-500/15 text-red-300 ring-red-500/30" };
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      {/* Kopf */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-900/70"
      >
        <div className="w-24 shrink-0 text-xs text-slate-500">
          {formatKickoff(entry.date)}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <TeamBadge team={home} fallbackId={entry.homeTeamId} link={false} align="right" />
        </div>
        <div className="shrink-0 px-1 text-center font-mono">
          {r ? (
            <span className="text-lg font-bold">{r.home}:{r.away}</span>
          ) : pred ? (
            <span className="text-slate-300">{pred.home}:{pred.away}</span>
          ) : (
            <span className="text-slate-500">vs</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamBadge team={away} fallbackId={entry.awayTeamId} link={false} />
        </div>
        <span className="shrink-0 text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {/* Kerninfo-Zeile unter dem Kopf */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 text-xs">
        {r && pred && (
          <span className="text-slate-500">
            {t("overview.tip")} {pred.home}:{pred.away}
          </span>
        )}
        {!r && pred && (
          <span className="text-slate-500">{t("overview.tip")}</span>
        )}
        {entry.confidence !== undefined && (
          <ConfidenceBadge value={entry.confidence} />
        )}
        {hitBadge && (
          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${hitBadge.cls}`}>
            {hitBadge.label}
          </span>
        )}
        <span className="ml-auto text-slate-500">
          {open ? t("overview.collapse") : t("overview.expand")}
        </span>
      </div>

      {/* Details (lazy geladen) */}
      {open && <MatchDetails entry={entry} teams={teams} />}
    </div>
  );
}

/** Volle KI-Einschätzung + News beider Teams — erst beim Aufklappen geladen. */
function MatchDetails({ entry, teams }: Props) {
  const { t } = useTranslation();
  const { data: match, isLoading } = useMatch(entry.matchId);
  const { data: home } = useTeam(entry.homeTeamId);
  const { data: away } = useTeam(entry.awayTeamId);

  if (isLoading || !match)
    return (
      <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-500">
        {t("overview.loadingDetails")}
      </div>
    );

  const pred = match.prediction;
  const fb = match.featureBundle;
  const homeName = teams.get(entry.homeTeamId)?.name ?? entry.homeTeamId;
  const awayName = teams.get(entry.awayTeamId)?.name ?? entry.awayTeamId;

  // Materielle News (impactTag != none) zuerst, dann auf 5 kürzen.
  const pick = (items: NewsItem[]): NewsItem[] =>
    [...items]
      .sort(
        (a, b) =>
          (a.impactTag === "none" ? 1 : 0) - (b.impactTag === "none" ? 1 : 0),
      )
      .slice(0, 5);

  return (
    <div className="space-y-3 border-t border-slate-800 px-4 py-3">
      {pred ? (
        <>
          {pred.probabilities && <ProbabilityBar p={pred.probabilities} />}
          {pred.baseline && (
            <div className="text-xs text-slate-400">
              {t("match.expectedGoals")}:{" "}
              <span className="font-mono text-slate-200">
                {pred.baseline.expectedGoals.home.toFixed(2)} :{" "}
                {pred.baseline.expectedGoals.away.toFixed(2)}
              </span>
            </div>
          )}
          {pred.rationale && (
            <p className="text-sm text-slate-300">{pred.rationale}</p>
          )}
          {/* keyFactors/risks aus den Modellen */}
          {pred.models && <WhyBlock models={pred.models} />}
          {fb && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-2 text-xs">
              <FeatureMini label={homeName} f={fb.home} />
              <FeatureMini label={awayName} f={fb.away} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">{t("overview.tipSoon")}</p>
      )}

      {/* News beider Teams */}
      <div className="grid gap-3 border-t border-slate-800 pt-2 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-400">
            {t("overview.newsHome", { team: homeName })}
          </h4>
          {home && home.news.length > 0 ? (
            <NewsList news={pick(home.news)} />
          ) : (
            <p className="text-xs text-slate-500">{t("overview.noNews")}</p>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-400">
            {t("overview.newsAway", { team: awayName })}
          </h4>
          {away && away.news.length > 0 ? (
            <NewsList news={pick(away.news)} />
          ) : (
            <p className="text-xs text-slate-500">{t("overview.noNews")}</p>
          )}
        </div>
      </div>

      <Link
        to={`/match/${entry.matchId}`}
        className="inline-block text-xs text-emerald-400 hover:underline"
      >
        {t("overview.details")} →
      </Link>
    </div>
  );
}

function WhyBlock({
  models,
}: {
  models: NonNullable<import("@wm/shared").Match["prediction"]>["models"];
}) {
  const factors = new Set<string>();
  const risks = new Set<string>();
  for (const m of [models?.claude, models?.chatgpt]) {
    m?.keyFactors.forEach((f) => factors.add(f));
    m?.risks.forEach((r) => risks.add(r));
  }
  if (factors.size === 0 && risks.size === 0) return null;
  return (
    <div className="space-y-1 text-xs">
      {factors.size > 0 && (
        <ul className="ml-4 list-disc text-emerald-300/90">
          {[...factors].slice(0, 4).map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
      {risks.size > 0 && (
        <ul className="ml-4 list-disc text-amber-300/80">
          {[...risks].slice(0, 3).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeatureMini({
  label,
  f,
}: {
  label: string;
  f: { elo: number; weightedForm: number };
}) {
  return (
    <div className="flex items-center justify-between text-slate-400">
      <span className="truncate">{label}</span>
      <span className="font-mono">
        Elo {f.elo} · Form {f.weightedForm.toFixed(2)}
      </span>
    </div>
  );
}

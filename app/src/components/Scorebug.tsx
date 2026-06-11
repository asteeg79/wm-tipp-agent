import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { PredictionIndexEntry, TeamSummary } from "@wm/shared";
import { formatPercent } from "../lib/format.js";

/** Countdown bis Anpfiff (tickt jede Sekunde). */
function useCountdown(iso: string): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [iso]);
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "—";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

/** Segmentierte Konfidenz-Anzeige (10 Balken). */
function Gauge({ value }: { value: number }) {
  const filled = Math.round(value * 10);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-[1px] ${
            i < filled ? "bg-acc" : "bg-edge-strong"
          }`}
        />
      ))}
    </div>
  );
}

/** 1X2-Wahrscheinlichkeitsbalken (Heim=cyan, Remis=grau, Auswärts=orange). */
function ProbBar({ p }: { p: { home: number; draw: number; away: number } }) {
  const seg: Array<[string, number, string]> = [
    ["1", p.home, "bg-home"],
    ["X", p.draw, "bg-fg-faint"],
    ["2", p.away, "bg-away"],
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-sm bg-surface-2">
        {seg.map(([k, v, c]) => (
          <div key={k} className={c} style={{ width: formatPercent(v) }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-fg-soft">
        {seg.map(([k, v]) => (
          <span key={k}>
            <span className="font-bold">{k}</span> {formatPercent(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  entry: PredictionIndexEntry;
  teams: Map<string, TeamSummary>;
}

/** Broadcast-„Scorebug": großer KI-Tipp, Konfidenz-Gauge, 1X2, Countdown. */
export function Scorebug({ entry, teams }: Props) {
  const { t } = useTranslation();
  const home = teams.get(entry.homeTeamId);
  const away = teams.get(entry.awayTeamId);
  const cd = useCountdown(entry.date);
  const tip = entry.predictedScore;

  return (
    <Link
      to={`/match/${entry.matchId}`}
      className="block overflow-hidden rounded-lg border border-edge bg-surface"
    >
      <div className="flex items-center justify-between border-b border-edge bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
          {t("overview.featured")}
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-acc">
          T- {cd}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-5">
        <Side team={home} fallbackId={entry.homeTeamId} />
        <div className="text-center">
          <div className="font-mono text-5xl font-bold leading-none">
            {tip ? (
              <>
                {tip.home}
                <span className="mx-1 text-fg-faint">:</span>
                {tip.away}
              </>
            ) : (
              <span className="text-fg-faint">vs</span>
            )}
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-acc">
            {t("overview.tip")}
          </div>
        </div>
        <Side team={away} fallbackId={entry.awayTeamId} />
      </div>

      {entry.probabilities && (
        <div className="px-4 pt-4">
          <ProbBar p={entry.probabilities} />
        </div>
      )}

      {entry.confidence !== undefined && (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            {t("match.confidence")}
          </span>
          <div className="flex-1">
            <Gauge value={entry.confidence} />
          </div>
          <span className="font-mono text-sm font-bold text-acc">
            {formatPercent(entry.confidence)}
          </span>
        </div>
      )}
    </Link>
  );
}

function Side({
  team,
  fallbackId,
}: {
  team: TeamSummary | undefined;
  fallbackId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {team?.logo ? (
        <img
          src={team.logo}
          alt=""
          className="h-8 w-auto rounded-[2px] object-cover"
          loading="lazy"
        />
      ) : (
        <span className="h-8 w-11 rounded-[2px] bg-surface-2" />
      )}
      <span className="text-center text-sm font-bold leading-tight">
        {team?.name ?? fallbackId}
      </span>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TeamSummary } from "@wm/shared";
import { useIndex, usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import {
  simulateTournament,
  simulateBracket,
  type BracketMatch,
} from "../lib/simulate.js";
import { TeamBadge } from "../components/TeamBadge.js";

const RUNS = 10000;

type View = "tree" | "odds";

export function BracketPage() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const { data: predIndex } = usePredictionsIndex();
  const teams = useTeamsMap();
  const [view, setView] = useState<View>("tree");

  if (!index || !predIndex)
    return <p className="text-fg-muted">{t("loading")}</p>;

  return (
    <section className="space-y-4">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-acc">
          {t("bracket.title")}
        </div>
        <p className="mt-1 text-sm text-fg-muted">{t("bracket.intro")}</p>
      </div>

      {/* Segment-Umschalter: K.-o.-Baum / Titelchancen */}
      <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-1">
        {(["tree", "odds"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              view === v ? "bg-acc text-canvas" : "text-fg-soft hover:text-fg"
            }`}
          >
            {v === "tree" ? t("bracket.tree") : t("bracket.odds")}
          </button>
        ))}
      </div>

      {view === "tree" ? <TreeView teams={teams} /> : <OddsTable teams={teams} />}
    </section>
  );
}

/* ── K.-o.-Baum ──────────────────────────────────────────────────────────── */

function TreeView({ teams }: { teams: Map<string, TeamSummary> }) {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const { data: predIndex } = usePredictionsIndex();
  const [seed, setSeed] = useState(() => Date.now());

  const bracket = useMemo(() => {
    if (!index || !predIndex) return null;
    return simulateBracket(index, predIndex, seed);
  }, [index, predIndex, seed]);

  if (!bracket) return null;
  const champ = teams.get(bracket.champion);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
          {t("bracket.draw16")}
        </span>
        <button
          onClick={() => setSeed(Date.now())}
          className="rounded-md border border-acc px-3 py-1.5 text-sm font-medium text-acc hover:bg-acc/10"
        >
          ↻ {t("bracket.reroll")}
        </button>
      </div>

      {/* Champion-Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-acc/50 bg-acc/[0.08] px-4 py-3">
        <span className="text-2xl">🏆</span>
        {champ?.logo && (
          <img
            src={champ.logo}
            alt=""
            className="h-6 w-auto rounded-[2px] object-cover"
          />
        )}
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-acc">
            {t("bracket.champion")}
          </div>
          <div className="text-lg font-bold">
            {champ?.name ?? bracket.champion}
          </div>
        </div>
      </div>

      {/* Scrollbarer Baum: Spalten je Runde, vertikal verteilt */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-4" style={{ minWidth: "min-content" }}>
          {bracket.rounds.map((rnd) => (
            <div key={rnd.stage} className="flex min-w-[150px] flex-col">
              <div className="pb-2 text-center font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                {t(`bracket.rounds.${rnd.stage}`)}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {rnd.matches.map((m, i) => (
                  <BracketCell
                    key={i}
                    m={m}
                    teams={teams}
                    final={rnd.stage === "final"}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-fg-faint">{t("bracket.treeNote")}</p>
    </div>
  );
}

function BracketCell({
  m,
  teams,
  final,
}: {
  m: BracketMatch;
  teams: Map<string, TeamSummary>;
  final: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border bg-surface ${
        final ? "border-acc/60" : "border-edge"
      }`}
    >
      <CellLine id={m.a} goals={m.score.a} win={m.winner === m.a} teams={teams} />
      <div className="h-px bg-edge" />
      <CellLine id={m.b} goals={m.score.b} win={m.winner === m.b} teams={teams} />
    </div>
  );
}

function CellLine({
  id,
  goals,
  win,
  teams,
}: {
  id: string;
  goals: number;
  win: boolean;
  teams: Map<string, TeamSummary>;
}) {
  const team = teams.get(id);
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${win ? "bg-acc/10" : ""}`}>
      {team?.logo ? (
        <img
          src={team.logo}
          alt=""
          className="h-3 w-auto shrink-0 rounded-[2px] object-cover"
          loading="lazy"
        />
      ) : (
        <span className="h-3 w-4 shrink-0 rounded-[2px] bg-surface-2" />
      )}
      <span
        className={`flex-1 truncate text-xs ${
          win ? "font-bold text-acc" : "font-medium text-fg-faint"
        }`}
      >
        {team?.code ?? id}
      </span>
      <span
        className={`shrink-0 font-mono text-sm font-bold ${
          win ? "text-acc" : "text-fg-faint"
        }`}
      >
        {goals}
      </span>
    </div>
  );
}

/* ── Titelchancen (Monte-Carlo, deterministisch) ─────────────────────────── */

function OddsTable({ teams }: { teams: Map<string, TeamSummary> }) {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const { data: predIndex } = usePredictionsIndex();

  const rows = useMemo(() => {
    if (!index || !predIndex) return [];
    const r = simulateTournament(index, predIndex, RUNS);
    return [...r.title.entries()]
      .map(([id, title]) => ({
        id,
        title,
        advance: r.advance.get(id) ?? 0,
        groupWinner: r.groupWinner.get(id) ?? 0,
      }))
      .sort((a, b) => b.title - a.title);
  }, [index, predIndex]);

  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-edge bg-surface/40">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
            <tr>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-right">{t("bracket.groupWinner")}</th>
              <th className="px-3 py-2 text-right">{t("bracket.advance")}</th>
              <th className="px-3 py-2 text-right">{t("bracket.title2")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-edge/70">
                <td className="px-3 py-1.5">
                  <TeamBadge team={teams.get(r.id)} fallbackId={r.id} />
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-fg-muted">
                  {pct(r.groupWinner)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-info">
                  {pct(r.advance)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-acc">
                  {pct(r.title)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-faint">
        {RUNS.toLocaleString()} {t("bracket.runs")} · {t("bracket.note")}
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIndex, usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { simulateTournament, type SimResult } from "../lib/simulate.js";
import { TeamBadge } from "../components/TeamBadge.js";

const RUNS = 10000;

export function BracketPage() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const { data: predIndex } = usePredictionsIndex();
  const teams = useTeamsMap();
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);

  // Auto-Simulation beim ersten Render, sobald Daten da sind.
  const ready = !!index && !!predIndex;
  useMemo(() => {
    if (ready && !result) {
      const r = simulateTournament(index!, predIndex!, RUNS);
      setResult(r);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <p className="text-slate-400">{t("loading")}</p>;

  const run = (): void => {
    setRunning(true);
    // kleiner Timeout, damit der „running"-State sichtbar wird
    setTimeout(() => {
      setResult(simulateTournament(index!, predIndex!, RUNS));
      setRunning(false);
    }, 30);
  };

  const rows = result
    ? [...result.title.entries()]
        .map(([id, title]) => ({
          id,
          title,
          advance: result.advance.get(id) ?? 0,
          groupWinner: result.groupWinner.get(id) ?? 0,
        }))
        .sort((a, b) => b.title - a.title)
    : [];

  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{t("bracket.title")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("bracket.intro")}</p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-md bg-emerald-600/80 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {running ? t("bracket.running") : t("bracket.run")}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-right">{t("bracket.groupWinner")}</th>
              <th className="px-3 py-2 text-right">{t("bracket.advance")}</th>
              <th className="px-3 py-2 text-right">{t("bracket.title2")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800/70">
                <td className="px-3 py-1.5">
                  <TeamBadge team={teams.get(r.id)} fallbackId={r.id} />
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                  {pct(r.groupWinner)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-sky-300">
                  {pct(r.advance)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-300">
                  {pct(r.title)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        {t("bracket.runs")}: {RUNS.toLocaleString()} · {t("bracket.note")}
      </p>
    </section>
  );
}

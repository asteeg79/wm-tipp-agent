import { formatPercent } from "../lib/format.js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIndex, useTeam } from "../lib/data.js";
import type { Team } from "@wm/shared";

export function ComparePage() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const { data: a } = useTeam(aId || undefined);
  const { data: b } = useTeam(bId || undefined);

  const sorted = [...(index?.teams ?? [])].sort((x, y) =>
    x.name.localeCompare(y.name),
  );

  const Picker = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }): JSX.Element => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-edge-strong bg-surface px-2 py-1.5 text-sm"
    >
      <option value="">{t("compare.pick")}</option>
      {sorted.map((tm) => (
        <option key={tm.id} value={tm.id}>
          {tm.name}
        </option>
      ))}
    </select>
  );

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">{t("compare.title")}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Picker value={aId} onChange={setAId} />
        <Picker value={bId} onChange={setBId} />
      </div>

      {a && b && (
        <div className="overflow-hidden rounded-xl border border-edge bg-surface/40">
          <table className="w-full text-sm">
            <thead className="bg-surface/60">
              <tr>
                <th className="px-3 py-2 text-right font-semibold">{a.name}</th>
                <th className="px-3 py-2 text-center text-xs uppercase tracking-wide text-fg-faint"></th>
                <th className="px-3 py-2 text-left font-semibold">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              <Row label={t("compare.elo")} av={a.elo} bv={b.elo} higher />
              <Row
                label={t("compare.form")}
                av={a.form?.weightedForm}
                bv={b.form?.weightedForm}
                higher
                dec={2}
              />
              <Row
                label={t("compare.goalsFor")}
                av={a.form?.goalsForAvg}
                bv={b.form?.goalsForAvg}
                higher
                dec={2}
              />
              <Row
                label={t("compare.goalsAgainst")}
                av={a.form?.goalsAgainstAvg}
                bv={b.form?.goalsAgainstAvg}
                higher={false}
                dec={2}
              />
              <Row
                label={t("compare.cleanSheets")}
                av={a.form?.cleanSheetRate}
                bv={b.form?.cleanSheetRate}
                higher
                pct
              />
              <Row
                label={t("compare.matches")}
                av={a.results.length}
                bv={b.results.length}
              />
              <H2HRow a={a} b={b} label={t("compare.h2h")} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function fmt(v: number | undefined, dec?: number, pct?: boolean): string {
  if (v === undefined) return "–";
  if (pct) return formatPercent(v);
  return dec ? v.toFixed(dec) : String(v);
}

function Row({
  label,
  av,
  bv,
  higher,
  dec,
  pct,
}: {
  label: string;
  av: number | undefined;
  bv: number | undefined;
  higher?: boolean;
  dec?: number;
  pct?: boolean;
}): JSX.Element {
  const better =
    av !== undefined && bv !== undefined && higher !== undefined
      ? higher
        ? av > bv
          ? "a"
          : bv > av
            ? "b"
            : null
        : av < bv
          ? "a"
          : bv < av
            ? "b"
            : null
      : null;
  const cls = (side: "a" | "b"): string =>
    better === side ? "font-semibold text-pos" : "text-fg-soft";
  return (
    <tr className="border-t border-edge/70">
      <td className={`px-3 py-1.5 text-right font-mono ${cls("a")}`}>
        {fmt(av, dec, pct)}
      </td>
      <td className="px-3 py-1.5 text-center text-xs text-fg-faint">{label}</td>
      <td className={`px-3 py-1.5 text-left font-mono ${cls("b")}`}>
        {fmt(bv, dec, pct)}
      </td>
    </tr>
  );
}

/** H2H aus a.potentialOpponents (gegen b) — funktioniert für Gruppengegner. */
function H2HRow({
  a,
  b,
  label,
}: {
  a: Team;
  b: Team;
  label: string;
}): JSX.Element {
  const h = a.potentialOpponents.find((o) => o.teamId === b.id)?.h2hSummary;
  const txt = h ? `${h.w}-${h.d}-${h.l} (${h.gf}:${h.ga})` : "–";
  return (
    <tr className="border-t border-edge/70">
      <td className="px-3 py-1.5 text-right font-mono text-fg-soft">{txt}</td>
      <td className="px-3 py-1.5 text-center text-xs text-fg-faint">{label}</td>
      <td className="px-3 py-1.5 text-left text-fg-faint">—</td>
    </tr>
  );
}

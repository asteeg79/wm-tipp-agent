import {
  Bar,
  BarChart,
  Cell,
  Label,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { TeamResult } from "@wm/shared";
import { pointsFor } from "../lib/format.js";

interface Props {
  results: TeamResult[];
  window?: number;
}

// Ergebnis-Farben: 0 = Niederlage (rot), 1 = Remis (amber), 3 = Sieg (grün).
const COLOR = ["#ef4444", "#f59e0b", "#f59e0b", "#22c55e"];

/**
 * Formkurve eines Teams: je Balken = ein Länderspiel (chronologisch, neueste
 * rechts). Höhe = erzielte Punkte (Sieg 3 / Remis 1 / Niederlage 0), Farbe
 * kodiert das Ergebnis zusätzlich. Tooltip zeigt Gegner und Endstand.
 */
export function FormChart({ results, window = 10 }: Props) {
  const { t } = useTranslation();
  // Chronologisch aufsteigend, die letzten `window` Spiele.
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const data = sorted.slice(-window).map((r) => ({
    date: r.date.slice(5),
    points: pointsFor(r.goalsFor, r.goalsAgainst),
    label: `${r.opponentName} ${r.goalsFor}:${r.goalsAgainst}`,
  }));

  if (data.length === 0) return null;

  const legend: Array<[string, string]> = [
    [t("team.formWin"), "#22c55e"],
    [t("team.formDraw"), "#f59e0b"],
    [t("team.formLoss"), "#ef4444"],
  ];

  return (
    <div className="space-y-1.5">
      {/* Titel + Farb-Legende */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold text-fg-soft">
          {t("team.formTitle")}
        </span>
        <div className="flex items-center gap-3">
          {legend.map(([lbl, c]) => (
            <span key={lbl} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ background: c }}
              />
              <span className="text-[10px] text-fg-faint">{lbl}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={42}
            />
            <YAxis
              domain={[0, 3]}
              ticks={[0, 1, 3]}
              width={34}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            >
              <Label
                value={t("team.formPoints")}
                angle={-90}
                position="insideLeft"
                style={{ fontSize: 10, fill: "#94a3b8", textAnchor: "middle" }}
              />
            </YAxis>
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.1)" }}
              formatter={(_v, _n, p) => [
                (p?.payload as { label?: string })?.label ?? "",
                t("team.formResult"),
              ]}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            />
            <Bar dataKey="points" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={COLOR[d.points] ?? "#64748b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Kurz-Erklärung der Achsen */}
      <p className="text-[10px] leading-snug text-fg-faint">
        {t("team.formCaption")}
      </p>
    </div>
  );
}

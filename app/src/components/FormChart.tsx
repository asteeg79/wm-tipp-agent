import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TeamResult } from "@wm/shared";
import { pointsFor } from "../lib/format.js";

interface Props {
  results: TeamResult[];
  window?: number;
}

const COLOR = ["#ef4444", "#f59e0b", "#f59e0b", "#22c55e"]; // 0,1,(2),3 Punkte

export function FormChart({ results, window = 10 }: Props) {
  // Chronologisch aufsteigend, die letzten `window` Spiele.
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const data = sorted.slice(-window).map((r) => ({
    date: r.date.slice(5),
    points: pointsFor(r.goalsFor, r.goalsAgainst),
    label: `${r.opponentName} ${r.goalsFor}:${r.goalsAgainst}`,
  }));

  if (data.length === 0) return null;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
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
            tick={{ fontSize: 10, fill: "#94a3b8" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.1)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
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
  );
}

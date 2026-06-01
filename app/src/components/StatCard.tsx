interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "sky" | "amber" | "slate";
}

const accentMap = {
  emerald: "text-pos",
  sky: "text-info",
  amber: "text-warn",
  slate: "text-fg",
};

export function StatCard({ label, value, hint, accent = "slate" }: Props) {
  return (
    <div className="rounded-xl border border-edge bg-surface/40 p-4">
      <div className="text-xs uppercase tracking-wide text-fg-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accentMap[accent]}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-faint">{hint}</div>}
    </div>
  );
}

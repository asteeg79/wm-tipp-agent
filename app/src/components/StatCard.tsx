interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "sky" | "amber" | "slate";
}

const accentMap = {
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  amber: "text-amber-400",
  slate: "text-slate-200",
};

export function StatCard({ label, value, hint, accent = "slate" }: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accentMap[accent]}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

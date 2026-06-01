import { useTranslation } from "react-i18next";

/** Konfidenz-Badge mit Farbskala (rot/gelb/grün). */
export function ConfidenceBadge({ value }: { value: number }) {
  const { t } = useTranslation();
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.6
      ? "bg-emerald-500/15 text-pos ring-emerald-500/30"
      : value >= 0.35
        ? "bg-amber-500/15 text-warn ring-amber-500/30"
        : "bg-red-500/15 text-neg ring-red-500/30";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {t("match.confidence")} {pct}%
    </span>
  );
}

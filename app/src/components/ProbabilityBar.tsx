import type { Outcome1x2 } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { formatPercent } from "../lib/format.js";

/** 1X2-Wahrscheinlichkeiten als gestapelter Balken (Heim/Remis/Auswärts). */
export function ProbabilityBar({ p }: { p: Outcome1x2 }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex h-7 w-full overflow-hidden rounded-md text-xs font-medium">
        <div
          className="flex items-center justify-center bg-emerald-600/80"
          style={{ width: formatPercent(p.home) }}
          title={`${t("match.home")} ${formatPercent(p.home)}`}
        >
          {p.home >= 0.12 ? formatPercent(p.home) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-surface-2"
          style={{ width: formatPercent(p.draw) }}
          title={`${t("match.draw")} ${formatPercent(p.draw)}`}
        >
          {p.draw >= 0.12 ? formatPercent(p.draw) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-sky-600/80"
          style={{ width: formatPercent(p.away) }}
          title={`${t("match.away")} ${formatPercent(p.away)}`}
        >
          {p.away >= 0.12 ? formatPercent(p.away) : ""}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-fg-faint">
        <span>{t("match.home")}</span>
        <span>{t("match.draw")}</span>
        <span>{t("match.away")}</span>
      </div>
    </div>
  );
}

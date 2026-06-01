import type { Outcome1x2 } from "@wm/shared";
import { useTranslation } from "react-i18next";

/** 1X2-Wahrscheinlichkeiten als gestapelter Balken (Heim/Remis/Auswärts). */
export function ProbabilityBar({ p }: { p: Outcome1x2 }) {
  const { t } = useTranslation();
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex h-7 w-full overflow-hidden rounded-md text-xs font-medium">
        <div
          className="flex items-center justify-center bg-emerald-600/80"
          style={{ width: pct(p.home) }}
          title={`${t("match.home")} ${pct(p.home)}`}
        >
          {p.home >= 0.12 ? pct(p.home) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-surface-2"
          style={{ width: pct(p.draw) }}
          title={`${t("match.draw")} ${pct(p.draw)}`}
        >
          {p.draw >= 0.12 ? pct(p.draw) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-sky-600/80"
          style={{ width: pct(p.away) }}
          title={`${t("match.away")} ${pct(p.away)}`}
        >
          {p.away >= 0.12 ? pct(p.away) : ""}
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

import { useTranslation } from "react-i18next";
import type { TeamResult } from "@wm/shared";

interface Props {
  results: TeamResult[];
  window?: number;
}

const CAP = 4; // Tordifferenz, ab der ein Balken voll ausschlägt
const MAX_PX = 48; // maximale Balkenhöhe je Halbseite
const MIN_PX = 14; // Mindesthöhe — auch knappe Ergebnisse bleiben sichtbar

/** Kurzes Gegner-Kürzel: FIFA-Code wenn vorhanden, sonst aus dem Namen. */
function shortCode(r: TeamResult): string {
  const base = r.opponentId.length <= 4 ? r.opponentId : r.opponentName;
  return base.slice(0, 3).toUpperCase();
}

/** Datum kurz als „TT.MM.“. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

/** Spielort-Kürzel für den Tooltip. */
function venueTag(v: TeamResult["venue"]): string {
  return v === "home" ? "H" : v === "away" ? "A" : "N";
}

/**
 * Formkurve eines Teams als Tordifferenz-Diagramm mit Ampelfarben:
 *  - Sieg → grüner Balken nach OBEN (Höhe ∝ Tordifferenz),
 *  - Niederlage → roter Balken nach UNTEN,
 *  - Remis → amber Stummel auf der Nulllinie (immer sichtbar).
 * X-Achse: Gegner-Kürzel · Ergebnis · Datum (chronologisch, neueste rechts).
 */
export function FormChart({ results, window = 10 }: Props) {
  const { t } = useTranslation();
  const data = [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-window);

  if (data.length === 0) return null;

  const legend: Array<[string, string]> = [
    [t("team.formWin"), "bg-pos"],
    [t("team.formDraw"), "bg-warn"],
    [t("team.formLoss"), "bg-neg"],
  ];

  return (
    <div className="space-y-1.5">
      {/* Titel + Ampel-Legende */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold text-fg-soft">
          {t("team.formTitle")}
        </span>
        <div className="flex items-center gap-3">
          {legend.map(([lbl, c]) => (
            <span key={lbl} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-[2px] ${c}`} />
              <span className="text-[10px] text-fg-faint">{lbl}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Diverging-Balken um die Nulllinie */}
      <div className="relative flex h-28 items-stretch gap-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-edge-strong" />
        {data.map((r, i) => {
          const gd = r.goalsFor - r.goalsAgainst;
          const mag = Math.min(Math.abs(gd), CAP) / CAP;
          const h = Math.round(MIN_PX + mag * (MAX_PX - MIN_PX));
          const title = `${r.opponentName} ${r.goalsFor}:${r.goalsAgainst} (${venueTag(r.venue)}) · ${shortDate(r.date)}`;
          return (
            <div key={i} className="relative min-w-0 flex-1" title={title}>
              {gd > 0 && (
                <div
                  className="absolute bottom-1/2 left-1/2 w-3/5 -translate-x-1/2 rounded-t-sm bg-pos"
                  style={{ height: h }}
                />
              )}
              {gd < 0 && (
                <div
                  className="absolute top-1/2 left-1/2 w-3/5 -translate-x-1/2 rounded-b-sm bg-neg"
                  style={{ height: h }}
                />
              )}
              {gd === 0 && (
                <div className="absolute left-1/2 top-1/2 h-2.5 w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-warn" />
              )}
            </div>
          );
        })}
      </div>

      {/* X-Achse: Gegner · Ergebnis · Datum */}
      <div className="flex gap-1">
        {data.map((r, i) => {
          const gd = r.goalsFor - r.goalsAgainst;
          const col = gd > 0 ? "text-pos" : gd < 0 ? "text-neg" : "text-warn";
          return (
            <div key={i} className="min-w-0 flex-1 text-center leading-tight">
              <div className="truncate font-mono text-[10px] font-semibold text-fg-soft">
                {shortCode(r)}
              </div>
              <div className={`font-mono text-[10px] font-bold ${col}`}>
                {r.goalsFor}:{r.goalsAgainst}
              </div>
              <div className="font-mono text-[9px] text-fg-faint">
                {shortDate(r.date)}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] leading-snug text-fg-faint">
        {t("team.formCaption")}
      </p>
    </div>
  );
}

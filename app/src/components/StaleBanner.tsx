import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePredictionsIndex } from "../lib/data.js";
import { timeAgo } from "../lib/format.js";

/**
 * Ab diesem Datenalter gilt der Stand als auffällig veraltet. Im Normal-
 * betrieb laufen die Pipelines deutlich häufiger; 3 h heißt: GitHubs
 * Scheduler verschluckt gerade Läufe oder die Pipeline ist rot.
 */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Dezenter Hinweis, wenn die Daten auffällig alt sind — stilles Veralten
 * soll für Nutzer sichtbar sein (Betriebs-Watchdog ohne Infrastruktur).
 */
export function StaleBanner() {
  const { t } = useTranslation();
  const { data } = usePredictionsIndex();
  // Minütlicher Tick, damit der Banner auch ohne Refetch erscheint/verschwindet.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const last = data?.lastUpdated;
  if (!last) return null;
  const age = Date.now() - new Date(last).getTime();
  if (age < STALE_AFTER_MS) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-warn">
      {t("stale.notice", { ago: timeAgo(last) })}
    </div>
  );
}

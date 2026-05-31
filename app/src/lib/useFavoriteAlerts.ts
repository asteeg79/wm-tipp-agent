/**
 * Hintergrund-Wächter: prüft periodisch, ob eine Partie eines Favoriten-Teams
 * kurz vor Anpfiff steht, und löst eine lokale Benachrichtigung aus.
 * Läuft, solange die App geöffnet ist (auch als Hintergrund-Tab).
 */
import { useEffect } from "react";
import { usePredictionsIndex } from "./data.js";
import {
  isWithinNotifyWindow,
  notificationsEnabled,
  notifyUpcoming,
} from "./favorites.js";
import type { TeamSummary } from "@wm/shared";

const CHECK_MS = 5 * 60 * 1000; // alle 5 Minuten

export function useFavoriteAlerts(
  favorites: Set<string>,
  teams: Map<string, TeamSummary>,
): void {
  const { data } = usePredictionsIndex();

  useEffect(() => {
    if (favorites.size === 0) return;
    if (!notificationsEnabled()) return;

    const check = (): void => {
      for (const e of data?.entries ?? []) {
        if (e.actualResult) continue;
        const involvesFav =
          favorites.has(e.homeTeamId) || favorites.has(e.awayTeamId);
        if (!involvesFav) continue;
        if (!isWithinNotifyWindow(e.date)) continue;
        notifyUpcoming({
          matchId: e.matchId,
          homeTeamId: e.homeTeamId,
          awayTeamId: e.awayTeamId,
          homeName: teams.get(e.homeTeamId)?.name ?? e.homeTeamId,
          awayName: teams.get(e.awayTeamId)?.name ?? e.awayTeamId,
          date: e.date,
          ...(e.predictedScore
            ? { tip: `${e.predictedScore.home}:${e.predictedScore.away}` }
            : {}),
        });
      }
    };

    check();
    const id = setInterval(check, CHECK_MS);
    return () => clearInterval(id);
  }, [favorites, teams, data]);
}

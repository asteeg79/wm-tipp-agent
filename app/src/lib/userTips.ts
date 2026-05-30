/**
 * Tippspiel-Speicher — ausschließlich LOKAL im Browser (localStorage).
 * Keine Serverdaten, datensparsam (Abschnitt 17).
 */
import { useState } from "react";

export interface UserTip {
  home: number;
  away: number;
}

const KEY = "wm-tipp-user-tips-v1";

function load(): Record<string, UserTip> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, UserTip>) : {};
  } catch {
    return {};
  }
}

function save(tips: Record<string, UserTip>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tips));
  } catch {
    /* Speicher voll/blockiert → still ignorieren */
  }
}

export function useUserTips(): {
  tips: Record<string, UserTip>;
  setTip: (matchId: string, tip: UserTip) => void;
  clear: () => void;
} {
  const [tips, setTips] = useState<Record<string, UserTip>>(load);

  const setTip = (matchId: string, tip: UserTip): void => {
    setTips((prev) => {
      const next = { ...prev, [matchId]: tip };
      save(next);
      return next;
    });
  };

  const clear = (): void => {
    setTips({});
    save({});
  };

  return { tips, setTip, clear };
}

/** Punktevergabe: 3 = exakt, 1 = richtige Tendenz, 0 = daneben. */
export function tipPoints(
  tip: { home: number; away: number },
  actual: { home: number; away: number },
): number {
  if (tip.home === actual.home && tip.away === actual.away) return 3;
  const sign = (s: { home: number; away: number }): number =>
    Math.sign(s.home - s.away);
  return sign(tip) === sign(actual) ? 1 : 0;
}

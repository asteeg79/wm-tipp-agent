/**
 * Favoriten-Teams + lokale Anpfiff-Benachrichtigungen — vollständig LOKAL
 * (localStorage + Notification-API), ohne Server.
 *
 * Grenzen (ehrlich): Ohne Push-Server (VAPID) sind nur Benachrichtigungen
 * möglich, solange die App-Seite (auch als Hintergrund-Tab) geöffnet ist.
 * Echtes Web-Push bei geschlossener App bräuchte einen serverseitigen
 * Push-Dienst — nicht Teil der statischen PWA.
 */
const NOTIFIED_KEY = "wm-tipp-notified-v1";

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/** Benachrichtigungsberechtigung anfragen. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function notificationsEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  );
}

/** Bereits benachrichtigte Match-IDs (verhindert Doppel-Benachrichtigung). */
function loadNotified(): Set<string> {
  return loadSet(NOTIFIED_KEY);
}
function markNotified(matchId: string): void {
  const s = loadNotified();
  s.add(matchId);
  saveSet(NOTIFIED_KEY, s);
}

export interface UpcomingFavMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  date: string;
  tip?: string;
}

/**
 * Zeigt eine lokale Benachrichtigung für eine bevorstehende Favoriten-Partie
 * (einmalig je Match). Nur wirksam bei erteilter Berechtigung.
 */
export function notifyUpcoming(m: UpcomingFavMatch): void {
  if (!notificationsEnabled()) return;
  if (loadNotified().has(m.matchId)) return;
  const body = m.tip
    ? `Anpfiff bald · Tipp: ${m.tip}`
    : "Anpfiff bald";
  try {
    new Notification(`${m.homeName} – ${m.awayName}`, {
      body,
      tag: m.matchId,
      icon: "icons/icon-192.png",
    });
    markNotified(m.matchId);
  } catch {
    /* Notification kann in manchen Kontexten werfen → ignorieren */
  }
}

/** Fenster (Minuten vor Anpfiff), in dem benachrichtigt wird. */
export const NOTIFY_WINDOW_MIN = 60;

/** Prüft, ob ein Match jetzt im Benachrichtigungsfenster liegt. */
export function isWithinNotifyWindow(dateIso: string, now = Date.now()): boolean {
  const kickoff = new Date(dateIso).getTime();
  const minsUntil = (kickoff - now) / 60000;
  return minsUntil > 0 && minsUntil <= NOTIFY_WINDOW_MIN;
}

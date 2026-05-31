import { useTranslation } from "react-i18next";
import {
  notificationsEnabled,
  requestNotificationPermission,
} from "../lib/favorites.js";

interface Props {
  isFavorite: boolean;
  onToggle: () => void;
}

/** Stern-Toggle für Favoriten; fragt beim Aktivieren Notification-Rechte an. */
export function FavoriteToggle({ isFavorite, onToggle }: Props) {
  const { t } = useTranslation();
  const handle = async (): Promise<void> => {
    const willAdd = !isFavorite;
    onToggle();
    // Beim Hinzufügen direkt nach Benachrichtigungs-Erlaubnis fragen.
    if (willAdd && !notificationsEnabled()) {
      await requestNotificationPermission();
    }
  };
  return (
    <button
      onClick={() => void handle()}
      aria-pressed={isFavorite}
      title={t("fav.add")}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium ${
        isFavorite
          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
          : "border-slate-700 text-slate-300 hover:bg-slate-800"
      }`}
    >
      <span>{isFavorite ? "★" : "☆"}</span>
      <span>{t("fav.favorite")}</span>
    </button>
  );
}

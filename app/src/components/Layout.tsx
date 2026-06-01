import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIndex, useTeamsMap } from "../lib/data.js";
import { timeAgo } from "../lib/format.js";
import { useVersion, formatVersion } from "../lib/useVersion.js";
import { UpdateBanner } from "./UpdateBanner.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { useFavorites } from "../lib/FavoritesContext.js";
import { useFavoriteAlerts } from "../lib/useFavoriteAlerts.js";

export function Layout() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const v = useVersion();
  const { favorites } = useFavorites();
  const teams = useTeamsMap();
  useFavoriteAlerts(favorites, teams);

  const navClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "bg-brand/15 text-brand"
        : "text-fg-soft hover:bg-surface-2"
    }`;

  return (
    <div className="flex min-h-full flex-col">
      <UpdateBanner v={v} />

      {/* Sportschau-artige rote Markenleiste */}
      <div className="h-1 bg-brand" />

      <header className="sticky top-0 z-10 border-b border-edge bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
          <NavLink to="/" className="mr-2 flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="text-base font-bold tracking-tight">
              {t("appTitle")}
            </span>
          </NavLink>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/" end className={navClass}>
              {t("nav.overview")}
            </NavLink>
            <NavLink to="/groups" className={navClass}>
              {t("nav.groups")}
            </NavLink>
            <NavLink to="/bracket" className={navClass}>
              {t("nav.bracket")}
            </NavLink>
            <NavLink to="/compare" className={navClass}>
              {t("nav.compare")}
            </NavLink>
            <NavLink to="/accuracy" className={navClass}>
              {t("nav.accuracy")}
            </NavLink>
            <NavLink to="/play" className={navClass}>
              {t("nav.play")}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {index?.lastUpdated && (
              <span className="hidden text-xs text-fg-faint sm:inline">
                {t("updated", { time: timeAgo(index.lastUpdated) })}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <footer className="border-t border-edge px-4 py-4 text-center text-xs text-fg-faint">
        <div>{t("disclaimer")}</div>
        <div className="mt-1 flex items-center justify-center gap-3 font-mono text-[10px]">
          <span>
            {t("version.label")} {formatVersion(v.current.version)} ·{" "}
            {v.current.commit}
          </span>
          <NavLink to="/admin" className="hover:text-brand">
            Admin
          </NavLink>
        </div>
      </footer>
    </div>
  );
}

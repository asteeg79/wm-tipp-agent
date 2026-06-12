import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIndex, useTeamsMap } from "../lib/data.js";
import { timeAgo } from "../lib/format.js";
import { useVersion, formatVersion } from "../lib/useVersion.js";
import { UpdateBanner } from "./UpdateBanner.js";
import { StaleBanner } from "./StaleBanner.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { useFavorites } from "../lib/FavoritesContext.js";
import { useFavoriteAlerts } from "../lib/useFavoriteAlerts.js";

/** Icon-Pfade (24er-Grid, stroke). */
const ICONS: Record<string, string> = {
  spiele: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  gruppen: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  team: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0z",
  genau: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  bracket: "M6 4H4v16h2M18 4h2v16h-2M6 9h4v6H6zM14 9h4v6h-4z",
};

const TABS: Array<{ to: string; key: string; icon: string; end?: boolean }> = [
  { to: "/", key: "spiele", icon: "spiele", end: true },
  { to: "/groups", key: "gruppen", icon: "gruppen" },
  { to: "/teams", key: "team", icon: "team" },
  { to: "/accuracy", key: "genau", icon: "genau" },
  { to: "/bracket", key: "bracket", icon: "bracket" },
];

export function Layout() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const v = useVersion();
  const { favorites } = useFavorites();
  const teams = useTeamsMap();
  useFavoriteAlerts(favorites, teams);
  const [menu, setMenu] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <UpdateBanner v={v} />
      <StaleBanner />

      {/* Matchday-Akzentleiste */}
      <div className="h-1 bg-acc" />

      <header className="sticky top-0 z-20 border-b border-edge bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-4 w-2 rounded-sm bg-acc" />
            <span className="text-base font-bold tracking-tight">MATCHDAY</span>
            <span className="rounded border border-acc px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-acc">
              WC26
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            {index?.lastUpdated && (
              <span className="hidden font-mono text-[11px] text-fg-faint sm:inline">
                {timeAgo(index.lastUpdated)}
              </span>
            )}
            <ThemeToggle />
            {/* Zahnrad → Menü mit Vergleich + Adminbereich */}
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                aria-label={t("nav.admin")}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-edge-strong bg-surface text-fg-soft hover:text-fg"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
              {menu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenu(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-edge bg-surface shadow-xl">
                    <MenuLink to="/compare" onClick={() => setMenu(false)}>
                      {t("nav.compare")}
                    </MenuLink>
                    <MenuLink to="/admin" onClick={() => setMenu(false)}>
                      {t("nav.admin")}
                    </MenuLink>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Inhalt — unten Platz für die fixe Tabbar. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-24 pt-2 text-center text-[11px] text-fg-faint">
        <div>{t("disclaimer")}</div>
        <div className="mt-1 font-mono text-[10px]">
          {t("version.label")} {formatVersion(v.current.version)} ·{" "}
          {v.current.commit}
        </div>
      </footer>

      {/* Bottom-Tabbar (mobile-first, immer sichtbar). */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-surface-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end ?? false}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                  isActive ? "text-acc" : "text-fg-faint"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isActive ? 2.2 : 1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  >
                    <path d={ICONS[tab.icon]} />
                  </svg>
                  <span>{t(`nav.${tab.key}`)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function MenuLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-2.5 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg"
    >
      {children}
    </Link>
  );
}

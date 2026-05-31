import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIndex } from "../lib/data.js";
import { timeAgo } from "../lib/format.js";
import { useVersion, formatVersion } from "../lib/useVersion.js";
import { UpdateBanner } from "./UpdateBanner.js";

export function Layout() {
  const { t } = useTranslation();
  const { data: index } = useIndex();
  const v = useVersion();

  const navClass = ({ isActive }: { isActive: boolean }): string =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      isActive
        ? "bg-emerald-500/15 text-emerald-300"
        : "text-slate-300 hover:bg-slate-800"
    }`;

  return (
    <div className="flex min-h-full flex-col">
      <UpdateBanner v={v} />
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="text-xl">⚽</span>
          <h1 className="mr-2 text-base font-semibold tracking-tight">
            {t("appTitle")}
          </h1>
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
          {index?.lastUpdated && (
            <span className="ml-auto text-xs text-slate-500">
              {t("updated", { time: timeAgo(index.lastUpdated) })}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-500">
        <div>{t("disclaimer")}</div>
        <div className="mt-1 font-mono text-[10px] text-slate-600">
          {t("version.label")} {formatVersion(v.current.version)} ·{" "}
          {v.current.commit}
        </div>
      </footer>
    </div>
  );
}

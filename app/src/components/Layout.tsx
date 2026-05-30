import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function Layout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <span className="text-xl">⚽</span>
          <h1 className="text-lg font-semibold tracking-tight">
            {t("appTitle")}
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-500">
        {t("disclaimer")}
      </footer>
    </div>
  );
}

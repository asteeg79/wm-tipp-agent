import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-2xl font-bold">{t("appTitle")}</h2>
        <p className="mt-2 text-slate-400">{t("tagline")}</p>
      </div>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-slate-400">
        {t("placeholder")}
      </div>
    </section>
  );
}

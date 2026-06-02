import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n.js";
import { useIndex, usePredictionsIndex } from "../lib/data.js";
import { useTheme } from "../lib/ThemeContext.js";
import { useVersion, formatVersion, formatBuiltAt } from "../lib/useVersion.js";
import { StatCard } from "../components/StatCard.js";
import { formatKickoff } from "../lib/format.js";

const GH_ACTIONS_URL = "https://github.com/asteeg79/wm-tipp-agent/actions";

export function AdminPage() {
  const { t } = useTranslation();
  const { pref, setPref } = useTheme();
  const v = useVersion();
  const { data: index } = useIndex();
  const { data: predIndex } = usePredictionsIndex();
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string): void => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };

  // Datenstatus ableiten.
  const teamCount = index?.teams.length ?? 0;
  const entries = predIndex?.entries ?? [];
  const matchCount = entries.length;
  const withAi = entries.filter((e) => e.confidence !== undefined).length;
  const finished = entries.filter((e) => e.actualResult !== null).length;
  const noFlag = (index?.teams ?? [])
    .filter((tm) => !tm.logo)
    .map((tm) => tm.name);

  const clearKey = (key: string, label: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    flash(label);
  };

  const clearCaches = async (): Promise<void> => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t("admin.title")}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t("admin.intro")}</p>
      </div>

      {/* Datenstatus */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-faint">
          {t("admin.dataStatus")}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("admin.teams")} value={String(teamCount)} />
          <StatCard label={t("admin.matches")} value={String(matchCount)} />
          <StatCard
            label={t("admin.withAi")}
            value={`${withAi}/${matchCount}`}
            accent="emerald"
          />
          <StatCard
            label={t("admin.finished")}
            value={String(finished)}
            accent="sky"
          />
        </div>
        <div className="rounded-xl border border-edge bg-surface/40 p-4 text-sm">
          <Row label={t("admin.lastUpdated")}>
            {index?.lastUpdated ? formatKickoff(index.lastUpdated) : "–"}
          </Row>
          <Row label={t("admin.appVersion")}>
            <span className="font-mono">
              {formatVersion(v.current.build)} ·{" "}
              {formatBuiltAt(v.current.version)} · {v.current.commit}
            </span>
          </Row>
          <Row label={t("admin.noFlag")}>
            {noFlag.length === 0 ? (
              <span className="text-pos">{t("admin.none")}</span>
            ) : (
              <span className="text-warn">{noFlag.join(", ")}</span>
            )}
          </Row>
        </div>
      </div>

      {/* Anzeige & lokale Daten */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-faint">
          {t("admin.settings")}
        </h3>
        <div className="space-y-3 rounded-xl border border-edge bg-surface/40 p-4 text-sm">
          <Row label={t("admin.theme")}>
            <select
              value={pref}
              onChange={(e) => setPref(e.target.value as typeof pref)}
              className="rounded-md border border-edge-strong bg-surface px-2 py-1"
            >
              <option value="system">{t("theme.system")}</option>
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
            </select>
          </Row>
          <Row label={t("admin.language")}>
            <select
              value={i18n.language.startsWith("de") ? "de" : "en"}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="rounded-md border border-edge-strong bg-surface px-2 py-1"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </Row>
          <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
            <AdminButton
              onClick={() =>
                clearKey("wm-tipp-user-tips-v1", t("admin.done"))
              }
            >
              {t("admin.resetTips")}
            </AdminButton>
            <AdminButton
              onClick={() =>
                clearKey("wm-tipp-favorites-v1", t("admin.done"))
              }
            >
              {t("admin.resetFavorites")}
            </AdminButton>
            <AdminButton
              onClick={() =>
                clearKey("wm-tipp-notified-v1", t("admin.done"))
              }
            >
              {t("admin.resetNotified")}
            </AdminButton>
            <AdminButton onClick={() => void clearCaches()}>
              {t("admin.clearCaches")}
            </AdminButton>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-faint">
          {t("admin.pipeline")}
        </h3>
        <div className="rounded-xl border border-edge bg-surface/40 p-4 text-sm text-fg-muted">
          <p>{t("admin.pipelineHint")}</p>
          <a
            href={GH_ACTIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded-md bg-brand/15 px-3 py-1.5 font-medium text-brand hover:bg-brand/25"
          >
            {t("admin.openActions")} →
          </a>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-pos/20 px-4 py-2 text-sm font-medium text-pos ring-1 ring-inset ring-pos/40">
          {toast}
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

function AdminButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-edge-strong px-2.5 py-1 text-xs text-fg-soft hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

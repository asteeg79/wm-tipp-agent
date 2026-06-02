import { useTranslation } from "react-i18next";
import { formatVersion, type VersionState } from "../lib/useVersion.js";

/** Schmales Banner oben, wenn ein neuer Deploy vorliegt. Mit Update-Button. */
export function UpdateBanner({ v }: { v: VersionState }) {
  const { t } = useTranslation();
  if (!v.updateAvailable) return null;
  return (
    <div className="sticky top-0 z-20 border-b border-emerald-500/40 bg-emerald-600/15 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm">
        <span aria-hidden>🔄</span>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-emerald-200">
            {t("version.updateTitle")}
          </span>
          <span className="ml-2 text-emerald-100/70">
            {t("version.updateBody")}
            {v.latest && (
              <span className="ml-1 font-mono text-xs text-emerald-100/50">
                {formatVersion(v.latest.build ?? 0)} · {v.latest.commit}
              </span>
            )}
          </span>
        </div>
        <button
          onClick={v.update}
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          {t("version.updateButton")}
        </button>
      </div>
    </div>
  );
}

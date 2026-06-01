import { useTranslation } from "react-i18next";
import { useTheme, type ThemePref } from "../lib/ThemeContext.js";

/** Kompakter Theme-Umschalter: System / Hell / Dunkel. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { pref, setPref } = useTheme();

  const opts: { value: ThemePref; icon: string; label: string }[] = [
    { value: "system", icon: "🖥", label: t("theme.system") },
    { value: "light", icon: "☀", label: t("theme.light") },
    { value: "dark", icon: "🌙", label: t("theme.dark") },
  ];

  return (
    <div
      className="flex items-center rounded-md border border-edge bg-surface-2 p-0.5"
      role="group"
      aria-label={t("theme.label")}
    >
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setPref(o.value)}
          title={o.label}
          aria-pressed={pref === o.value}
          className={`rounded px-1.5 py-0.5 text-sm transition-colors ${
            pref === o.value
              ? "bg-brand/15 text-brand"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * Theme-Verwaltung: "system" (folgt OS), "light" oder "dark".
 * Setzt die Klasse .light/.dark auf <html> (Tailwind darkMode:"class") und
 * persistiert die Wahl lokal. Default: system.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "wm-tipp-theme-v1";

function loadPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

/** Effektives Theme (system aufgelöst) anhand OS-Einstellung. */
function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function apply(effective: "light" | "dark"): void {
  const el = document.documentElement;
  el.classList.remove("light", "dark");
  el.classList.add(effective);
}

interface ThemeCtx {
  pref: ThemePref;
  effective: "light" | "dark";
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(loadPref);
  const [effective, setEffective] = useState<"light" | "dark">(() =>
    resolve(loadPref()),
  );

  // Theme anwenden + auf OS-Wechsel reagieren (nur bei pref "system").
  useEffect(() => {
    const eff = resolve(pref);
    setEffective(eff);
    apply(eff);

    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      const e = resolve("system");
      setEffective(e);
      apply(e);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const value = useMemo<ThemeCtx>(
    () => ({
      pref,
      effective,
      setPref: (p) => {
        setPrefState(p);
        try {
          localStorage.setItem(KEY, p);
        } catch {
          /* ignore */
        }
      },
    }),
    [pref, effective],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme außerhalb des ThemeProvider");
  return ctx;
}

/**
 * Geteilter Favoriten-State (localStorage-gestützt), damit Toggle (Team-Detail)
 * und Alert-Wächter (Layout) dieselbe Quelle nutzen.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const FAV_KEY = "wm-tipp-favorites-v1";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function save(set: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

interface FavoritesCtx {
  favorites: Set<string>;
  toggle: (teamId: string) => void;
  isFavorite: (teamId: string) => boolean;
}

const Ctx = createContext<FavoritesCtx | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(load);
  const value = useMemo<FavoritesCtx>(
    () => ({
      favorites,
      isFavorite: (id) => favorites.has(id),
      toggle: (id) =>
        setFavorites((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          save(next);
          return next;
        }),
    }),
    [favorites],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavoritesCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavorites außerhalb des FavoritesProvider");
  return ctx;
}

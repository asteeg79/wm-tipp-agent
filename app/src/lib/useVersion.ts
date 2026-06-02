/**
 * Versions-Überwachung: vergleicht die im Bundle eingebackene Build-Version
 * (__APP_VERSION__ / __APP_COMMIT__) mit dem live ausgelieferten
 * /version.json. Weicht der Server-Stand ab, liegt ein neuer Deploy vor.
 *
 * Kombiniert zwei Signale:
 *  1. vite-plugin-pwa: neuer Service Worker verfügbar (needRefresh).
 *  2. Poller auf /version.json (erkennt neuen Deploy auch unabhängig vom SW).
 */
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Vom Vite-`define` zur Build-Zeit injiziert.
declare const __APP_VERSION__: number;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD__: number;

export const APP_VERSION: number =
  typeof __APP_VERSION__ === "number" ? __APP_VERSION__ : 0;
export const APP_COMMIT: string =
  typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";
export const APP_BUILD: number =
  typeof __APP_BUILD__ === "number" ? __APP_BUILD__ : 0;

/** Sprechende Versionsnummer: "v0.<build>". */
export function formatVersion(build: number): string {
  return `v0.${build}`;
}

/** Commit-Zeitstempel YYYYMMDDHHMM → "2026-05-31 13:31" (für Detailanzeige). */
export function formatBuiltAt(v: number): string {
  const s = String(v);
  if (s.length !== 12) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

interface ServerVersion {
  build?: number;
  version: number;
  commit: string;
}

/** Intervall des Versions-Polls (ms). */
const POLL_MS = 60_000;

export interface VersionState {
  /** Eine neue Version liegt vor (SW-Update ODER abweichende version.json). */
  updateAvailable: boolean;
  /** Aktuell laufende (eingebaute) Version. */
  current: { build: number; version: number; commit: string };
  /** Auf dem Server gefundene Version (falls abgerufen). */
  latest: ServerVersion | null;
  /** App aktualisieren: SW übernehmen + neu laden. */
  update: () => void;
}

const versionUrl = (): string => `${import.meta.env.BASE_URL}version.json`;

export function useVersion(): VersionState {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      // Periodisch nach SW-Updates suchen.
      if (reg) {
        setInterval(() => {
          void reg.update();
        }, POLL_MS);
      }
    },
  });

  const [latest, setLatest] = useState<ServerVersion | null>(null);

  useEffect(() => {
    let active = true;
    const check = async (): Promise<void> => {
      try {
        const res = await fetch(`${versionUrl()}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ServerVersion;
        if (active) setLatest(data);
      } catch {
        /* offline o. Ä. → ignorieren */
      }
    };
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Neuer Deploy, wenn der Server-Commit vom eingebauten abweicht
  // (commit ist eindeutig pro Repo-Stand; version als Fallback).
  const versionMismatch =
    latest !== null &&
    latest.commit !== APP_COMMIT &&
    APP_COMMIT !== "dev" &&
    latest.version >= APP_VERSION;

  const update = (): void => {
    // Service Worker übernehmen lassen; reload erfolgt automatisch.
    void updateServiceWorker(true);
    // Fallback-Reload, falls kein wartender SW vorhanden ist.
    setTimeout(() => window.location.reload(), 800);
  };

  return {
    updateAvailable: needRefresh || versionMismatch,
    current: { build: APP_BUILD, version: APP_VERSION, commit: APP_COMMIT },
    latest,
    update,
  };
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Version aus public/version.json lesen (gen-version.mjs schreibt sie im Build
// VOR vite build). So kennt das App-Bundle exakt seinen eigenen Build-Stand.
function readBuildVersion(): {
  version: number;
  commit: string;
} {
  try {
    const p = fileURLToPath(new URL("./public/version.json", import.meta.url));
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      version?: number;
      commit?: string;
    };
    return {
      version: j.version ?? 0,
      commit: j.commit ?? "dev",
    };
  } catch {
    return { version: 0, commit: "dev" };
  }
}
const buildVersion = readBuildVersion();

// Base-Path:
//  - Vercel (und lokal): "/" (App läuft an der Domain-Root).
//  - GitHub Pages: "/<repo-name>/" (Unterpfad) → via VITE_BASE oder
//    VITE_REPO_NAME im Pages-Workflow gesetzt.
// VITE_BASE hat immer Vorrang; sonst Pages-Logik nur ohne VERCEL.
const repoName = process.env.VITE_REPO_NAME ?? "wm-tipp-agent";
const base =
  process.env.VITE_BASE ??
  (process.env.NODE_ENV === "production" && !process.env.VERCEL
    ? `/${repoName}/`
    : "/");

export default defineConfig({
  base,
  // Build-Version als Konstanten ins Bundle einbacken (für Versionsvergleich).
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion.version),
    __APP_COMMIT__: JSON.stringify(buildVersion.commit),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "WM-Tipp-Assistent 2026",
        short_name: "WM-Tipp 2026",
        description:
          "Begründete Ergebnistipps für die FIFA WM 2026 — KI-gestützt.",
        theme_color: "#0a0e15",
        background_color: "#0a0e15",
        display: "standalone",
        start_url: base,
        scope: base,
        lang: "de",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // version.json nie precachen — der Update-Check braucht den frischen
        // Server-Stand.
        globIgnores: ["**/version.json"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "wm-data",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            // version.json immer frisch vom Netz (für Versionsvergleich).
            urlPattern: ({ url }) => url.pathname.endsWith("/version.json"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});

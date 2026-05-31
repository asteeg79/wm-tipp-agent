import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
        theme_color: "#0f172a",
        background_color: "#0f172a",
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
        // JSON-Daten: StaleWhileRevalidate → offline letzter Stand verfügbar.
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
        ],
      },
    }),
  ],
});

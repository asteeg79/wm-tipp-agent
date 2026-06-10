import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router.js";
import { FavoritesProvider } from "./lib/FavoritesContext.js";
import { ThemeProvider } from "./lib/ThemeContext.js";
import "./i18n.js";
// Matchday-Schriften (offline-fähig via @fontsource — keine Google-CDN-Abhängigkeit).
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./index.css";

// Daten (Tipps/Ergebnisse) sollen zeitnah aktuell sein, ohne bei jedem
// Render zu flackern: kurze staleTime + Refetch bei Fokus/Reconnect. So lädt
// z. B. das Dashboard beim Zurückkehren neue Tipps nach, statt den alten
// Stand aus dem Cache zu zeigen. Den eigentlichen Netz-Vorrang regelt der
// Service Worker (NetworkFirst für /data, s. vite.config.ts).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FavoritesProvider>
          <RouterProvider router={router} />
        </FavoritesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

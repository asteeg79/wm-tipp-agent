import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { HomePage } from "./pages/HomePage.js";
import { GroupsPage } from "./pages/GroupsPage.js";
import { TeamPage } from "./pages/TeamPage.js";
import { MatchPage } from "./pages/MatchPage.js";
import { AccuracyPage } from "./pages/AccuracyPage.js";
import { BracketPage } from "./pages/BracketPage.js";
import { ComparePage } from "./pages/ComparePage.js";
import { PlayPage } from "./pages/PlayPage.js";

// Router-Basename = Vite-base (BASE_URL), ohne abschließenden Slash.
// Funktioniert für Vercel ("/") wie für GitHub Pages ("/<repo>/").
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "groups", element: <GroupsPage /> },
        { path: "accuracy", element: <AccuracyPage /> },
        { path: "bracket", element: <BracketPage /> },
        { path: "compare", element: <ComparePage /> },
        { path: "play", element: <PlayPage /> },
        { path: "team/:teamId", element: <TeamPage /> },
        { path: "match/:matchId", element: <MatchPage /> },
      ],
    },
  ],
  { basename },
);

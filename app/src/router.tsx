import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { HomePage } from "./pages/HomePage.js";

// Router-Basename muss dem GitHub-Pages-Base-Path entsprechen.
const repoName = import.meta.env.VITE_REPO_NAME ?? "wm-tipp-agent";
const basename = import.meta.env.PROD ? `/${repoName}` : "/";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [{ index: true, element: <HomePage /> }],
    },
  ],
  { basename },
);

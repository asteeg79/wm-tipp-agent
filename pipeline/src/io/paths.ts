/**
 * Zentrale Pfad-Helfer für die generierten JSON-Dateien unter /data.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo-Root (zwei Ebenen über pipeline/src/io). */
export const repoRoot = resolve(__dirname, "..", "..", "..");
export const dataDir = join(repoRoot, "data");
export const teamsDir = join(dataDir, "teams");
export const matchesDir = join(dataDir, "matches");
export const cacheDir = join(repoRoot, "pipeline", "cache");

export const indexPath = join(dataDir, "index.json");
export const predictionsIndexPath = join(dataDir, "predictions-index.json");

export const teamPath = (teamId: string): string =>
  join(teamsDir, `${teamId}.json`);
export const matchPath = (matchId: string): string =>
  join(matchesDir, `${matchId}.json`);

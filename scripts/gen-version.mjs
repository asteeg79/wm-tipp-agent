// Erzeugt app/public/version.json mit einer fortlaufenden Versionsnummer +
// Git-Commit-SHA, damit die laufende App gegen den Repo-/Deploy-Stand
// abgeglichen werden kann. Läuft im Build (Vercel + lokal) VOR vite build.
//
// version  = Commit-Zeitstempel als YYYYMMDDHHMM (UTC). Monoton steigend,
//            an den Repo-Stand gebunden und auch bei Vercels shallow clone
//            verfügbar (anders als die Commit-Anzahl).
// commit   = kurzer Git-SHA (eindeutig pro Repo-Stand → Basis des Vergleichs)
// builtAt  = Build-Zeitpunkt (ISO)
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// SHA: auf Vercel aus der Build-Env, sonst aus git.
const fullSha =
  process.env.VERCEL_GIT_COMMIT_SHA || sh("git rev-parse HEAD") || "unknown";
const commit = fullSha.slice(0, 7);

// Fortlaufende Nummer aus dem Commit-Zeitstempel (UTC, YYYYMMDDHHMM).
// Monoton steigend + auch bei shallow clone (Vercel) korrekt, da der
// HEAD-Commit seinen Zeitstempel immer mitführt.
function commitVersion() {
  const epochRaw = sh("git show -s --format=%ct HEAD"); // Commit-Zeit (Unix-UTC)
  const epoch = epochRaw && /^\d+$/.test(epochRaw) ? Number(epochRaw) : null;
  const d = epoch ? new Date(epoch * 1000) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp =
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return Number(stamp);
}
const version = commitVersion();

const info = {
  version,
  commit,
  builtAt: new Date().toISOString(),
};

const dest = join(root, "app", "public", "version.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(info) + "\n", "utf8");
console.log(`[gen-version] v${version} · ${commit} → ${dest}`);

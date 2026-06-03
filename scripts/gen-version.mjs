// Erzeugt app/public/version.json. Läuft im Build (Vercel + lokal) VOR vite build.
//
// version  = Commit-Zeitstempel YYYYMMDDHHMM (UTC) — monoton steigend und auch
//            bei Vercels SHALLOW Clone korrekt. Dient als Anzeige
//            (CalVer "v2026.06.03-1301") UND als Vergleichs-Basis für die
//            Update-Erkennung. (Eine Commit-ANZAHL wäre auf Vercel unbrauchbar:
//            der Shallow-Clone hat nur ~10 Commits, --unshallow scheitert dort
//            → die Nummer zählte nicht hoch.)
// commit   = kurzer Git-SHA (eindeutig pro Repo-Stand)
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

// Monotone Vergleichs-Zahl aus dem Commit-Zeitstempel (shallow-clone-sicher).
function commitTimestampVersion() {
  const epochRaw = sh("git show -s --format=%ct HEAD");
  const epoch = epochRaw && /^\d+$/.test(epochRaw) ? Number(epochRaw) : null;
  const d = epoch ? new Date(epoch * 1000) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return Number(
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`,
  );
}

const version = commitTimestampVersion();

const info = {
  version,
  commit,
  builtAt: new Date().toISOString(),
};

/** CalVer-Anzeige aus YYYYMMDDHHMM → "v2026.06.03-1301". */
function calver(v) {
  const s = String(v);
  if (s.length !== 12) return `v${v}`;
  return `v${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}-${s.slice(8, 12)}`;
}

const dest = join(root, "app", "public", "version.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(info) + "\n", "utf8");
console.log(`[gen-version] ${calver(version)} · ${commit} → ${dest}`);

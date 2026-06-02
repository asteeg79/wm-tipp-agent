// Erzeugt app/public/version.json. Läuft im Build (Vercel + lokal) VOR vite build.
//
// build    = fortlaufende Build-Nummer = Commit-Anzahl (git rev-list --count).
//            Steigt mit jedem Commit. Angezeigt als "v0.<build>".
// version  = Commit-Zeitstempel YYYYMMDDHHMM (UTC) — monoton steigend und auch
//            bei shallow clone verfügbar; dient als robuste VERGLEICHS-Basis
//            für die Update-Erkennung (unabhängig von der Build-Nummer).
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

// Build-Nummer = Commit-Anzahl. Vercel klont shallow → Historie nachladen,
// damit die Zählung dem echten Repo-Stand entspricht.
function buildNumber() {
  if (sh("git rev-parse --is-shallow-repository") === "true") {
    sh("git fetch --unshallow --quiet") ||
      sh("git fetch --deepen=1000000 --quiet");
  }
  const c = sh("git rev-list --count HEAD");
  return c && /^\d+$/.test(c) ? Number(c) : 0;
}

const version = commitTimestampVersion();
const build = buildNumber();

const info = {
  build,
  version,
  commit,
  builtAt: new Date().toISOString(),
};

const dest = join(root, "app", "public", "version.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(info) + "\n", "utf8");
console.log(`[gen-version] v0.${build} (${version}) · ${commit} → ${dest}`);

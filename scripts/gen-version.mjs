// Erzeugt app/public/version.json mit einer fortlaufenden Versionsnummer +
// Git-Commit-SHA, damit die laufende App gegen den Repo-/Deploy-Stand
// abgeglichen werden kann. Läuft im Build (Vercel + lokal) VOR vite build.
//
// version  = fortlaufende Commit-Anzahl (monoton steigend, "Build-Nummer")
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

// Fortlaufende Nummer = Gesamt-Commit-Anzahl (monoton steigend).
// Vercel klont shallow (Tiefe 1) → Historie ggf. nachladen, damit die Zahl
// dem echten Repo-Stand entspricht.
if (sh("git rev-parse --is-shallow-repository") === "true") {
  sh("git fetch --unshallow --quiet");
}
const countRaw = sh("git rev-list --count HEAD");
const version = countRaw && /^\d+$/.test(countRaw) ? Number(countRaw) : 0;

const info = {
  version,
  commit,
  builtAt: new Date().toISOString(),
};

const dest = join(root, "app", "public", "version.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(info) + "\n", "utf8");
console.log(`[gen-version] v${version} · ${commit} → ${dest}`);

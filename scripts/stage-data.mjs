// Kopiert die generierten JSONs aus /data nach app/public/data, damit der
// Vite-Build sie als statische Assets ausliefert (gleicher Origin → die App
// lädt /data/*.json ohne externen Call). Wird im Vercel-Build + lokal genutzt.
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "data");
const dest = join(root, "app", "public", "data");

if (!existsSync(src)) {
  console.warn(`[stage-data] /data fehlt (${src}) — überspringe.`);
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[stage-data] /data → ${dest} kopiert.`);

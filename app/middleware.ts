import { next } from "@vercel/edge";

/**
 * Origin-Schutz (Cloudflare-Bypass schließen).
 *
 * Problem: Die Custom-Domain ist von Vercels eigenem Schutz ausgenommen, daher
 * liefert ein Direktaufruf der Vercel-Origin-IP mit passendem Host-Header die
 * App AN Cloudflare Access VORBEI aus. Diese Middleware schließt das, indem sie
 * nur Requests durchlässt, die nachweislich über Cloudflare kommen:
 *
 *  - Cloudflare setzt per Transform Rule den geheimen Header `x-origin-secret`
 *    (Wert = Vercel-Env `ORIGIN_SECRET`) auf JEDEN proxied Request.
 *  - Direktzugriffe auf die Vercel-IP haben den Header nicht → 403.
 *
 * WICHTIG: Der Schutz ist erst aktiv, wenn `ORIGIN_SECRET` in Vercel gesetzt
 * ist. Solange die Variable fehlt, lässt die Middleware ALLES durch (bewusst
 * „fail-open", damit ein Deploy ohne gesetzte Variable die Seite nicht für alle
 * mit 403 sperrt). Header-Name und Secret müssen in Cloudflare (Transform Rule)
 * und Vercel (Environment Variable) exakt übereinstimmen.
 */
export const config = {
  // Auf allen Pfaden ausführen (auch /assets, /data, /index.html).
  matcher: "/:path*",
};

export default function middleware(request: Request): Response {
  const expected = process.env.ORIGIN_SECRET;

  // Guard nicht konfiguriert → durchlassen (kein versehentlicher Totalausfall,
  // bevor Cloudflare + Vercel-Env eingerichtet sind).
  if (!expected) return next();

  const provided = request.headers.get("x-origin-secret");
  if (provided && timingSafeEqual(provided, expected)) return next();

  // Kein/falsches Secret → Direktzugriff am Cloudflare-Proxy vorbei: blocken.
  return new Response("Forbidden", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Längen- und zeitkonstanter Vergleich (vermeidet Timing-Seitenkanäle). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// "Suggest a better spot" (2026-11-11): stores a visitor's suggested place to stand. Nothing on the map changes automatically.
// Limits: size checks, a hidden honeypot field, at most 30 suggestions a day per visitor (IP address hashed with the date; the
// address itself is never stored).
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const num = (v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi;
async function sha(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 32); }

export async function onRequestPost({ request, env }) {
  if ((+request.headers.get("content-length") || 0) > 5000) return J({ ok: false, error: "too large" }, 413);
  let b; try { b = await request.json(); } catch { return J({ ok: false, error: "bad request" }, 400); }
  if (b.website) return J({ ok: true });                                   // honeypot: robots fill every field
  const pt = a => Array.isArray(a) && a.length === 2 && num(a[0], -90, 90) && num(a[1], -180, 180);
  if (typeof b.map !== "string" || !/^[a-z0-9-]{1,40}$/.test(b.map) || !Number.isInteger(b.rank) || b.rank < 1 || b.rank > 100 || !pt(b.stand_here))
    return J({ ok: false, error: "bad request" }, 400);
  const note = typeof b.note === "string" ? b.note.slice(0, 1000) : "";
  const name = typeof b.name === "string" ? b.name.slice(0, 120) : "";
  const was = pt(b.was) ? b.was : [null, null];
  const g = b.gps && num(b.gps.lat, -90, 90) && num(b.gps.lon, -180, 180) ? b.gps : null;
  const now = new Date().toISOString();
  const day = await sha((request.headers.get("CF-Connecting-IP") || "") + "|" + now.slice(0, 10) + "|xd-sug");
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE day_key = ?").bind(day).first();
  if (c && c.n >= 30) return J({ ok: false, error: "daily limit reached" }, 429);
  await env.DB.prepare("INSERT INTO suggestions (made, map, rank, name, lat, lon, was_lat, was_lon, gps_lat, gps_lon, gps_acc, note, day_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(now, b.map, b.rank, name, b.stand_here[0], b.stand_here[1], was[0], was[1], g ? g.lat : null, g ? g.lon : null, g && num(g.acc, 0, 1e6) ? g.acc : null, note, day).run();
  return J({ ok: true });
}
export const onRequest = () => J({ ok: false, error: "use POST" }, 405);

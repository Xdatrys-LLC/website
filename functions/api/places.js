// Custom maps, step C1 (spec approved 2026-11-24): the place search behind "Where are you going?".
// Data: our own copy of GeoNames (CC BY 4.0) in D1 'DB' (tables places, place_keys; pipeline/places_build.py).
// Only for Pro members and the owner (Pro is not on sale yet, so in practice the owner only).
//   /api/places?q=san ju        -> up to 8 matching places (name or any word start, accents ignored)
//   /api/places?countries=1     -> every country with its continent (theme-first flow)
//   /api/places?regions=IT      -> the first-level regions of a country
import { who, J } from "../_lib/auth.js";

const norm = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  const pro = w.role === "owner" || (w.role === "member" && (w.m || {}).plan === "pro");
  if (!pro) return J({ ok: false, error: "Pro members only" }, 401);
  if (!env.DB) return J({ ok: false, error: "place list not available" }, 503);
  const url = new URL(request.url);
  const cache = { headers: { "cache-control": "private, max-age=86400" } };
  if (url.searchParams.get("countries")) {
    const r = await env.DB.prepare("SELECT cc, name, continent FROM places WHERE kind = 'country' ORDER BY name").all();
    return J({ ok: true, countries: r.results }, 200, cache.headers);
  }
  const cc = (url.searchParams.get("regions") || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) {
    const r = await env.DB.prepare("SELECT id, name, lat, lon FROM places WHERE cc = ?1 AND kind = 'region' ORDER BY name").bind(cc).all();
    return J({ ok: true, regions: r.results }, 200, cache.headers);
  }
  const q = norm(url.searchParams.get("q")).slice(0, 60);
  if (q.length < 3) return J({ ok: true, places: [] });
  const r = await env.DB.prepare(
    "SELECT p.id, p.name, p.label, p.kind, p.cc, p.country, p.continent, p.region, p.lat, p.lon, MAX(k.k = ?1) AS exact " +
    "FROM place_keys k JOIN places p ON p.id = k.id WHERE k.k >= ?1 AND k.k < ?2 " +
    "GROUP BY p.id ORDER BY exact DESC, p.score DESC LIMIT 8").bind(q, q + "~").all();
  return J({ ok: true, places: r.results }, 200, cache.headers);
}

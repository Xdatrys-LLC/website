// Custom maps C2: "Create my map". Checks the request on the server (the place comes from our own place list, never from
// the browser), the member's credits and limits, then puts the map in the queue and holds the worst-case credits.
import { proUser, credits, ledger, aiSpentToday, SIZES, THEMES, THEME_NAMES, AI_CAP_USD, J, now } from "../../_lib/custom.js";

export async function onRequestPost({ request, env }) {
  const w = await proUser(request, env);
  if (!w) return J({ ok: false, error: "Custom maps are part of Pro." }, 401);
  if (!env.MEMBERS || !env.DB) return J({ ok: false, error: "Not available right now." }, 503);
  let b;
  try { b = await request.json(); } catch { return J({ ok: false, error: "Bad request." }, 400); }
  const size = +b.size;
  const layers = Array.isArray(b.layers) ? [...new Set(b.layers.filter((t) => THEMES.includes(t)))] : [];
  if (!SIZES.includes(size) || !layers.length) return J({ ok: false, error: "Choose the photo themes and the number of spots." }, 400);

  let req, label;
  if (b.mode === "place") {
    const p = await env.DB.prepare("SELECT id, name, label, kind, cc, country, region, lat, lon FROM places WHERE id = ?1").bind(+b.place_id).first();
    if (!p) return J({ ok: false, error: "Please choose a place from the list." }, 400);
    req = { mode: "place", place: p, layers, size }; label = p.label;
  } else if (b.mode === "theme") {
    const theme = b.theme;
    if (!THEMES.includes(theme) || theme === "top") return J({ ok: false, error: "Please choose a theme." }, 400);
    let country = null, region = null;
    if (b.cc) {
      country = await env.DB.prepare("SELECT cc, name, continent FROM places WHERE kind = 'country' AND cc = ?1").bind(String(b.cc).toUpperCase()).first();
      if (!country) return J({ ok: false, error: "Please choose a country from the list." }, 400);
    }
    if (b.region_id) {
      if (!country) return J({ ok: false, error: "Please choose the country first." }, 400);
      region = await env.DB.prepare("SELECT id, name, lat, lon FROM places WHERE id = ?1 AND kind = 'region' AND cc = ?2").bind(+b.region_id, country.cc).first();
      if (!region) return J({ ok: false, error: "Please choose a region from the list." }, 400);
    }
    const continent = country ? country.continent : String(b.continent || "");
    const ok = await env.DB.prepare("SELECT 1 FROM places WHERE kind = 'country' AND continent = ?1 LIMIT 1").bind(continent).first();
    if (!ok) return J({ ok: false, error: "Please choose a continent or a country." }, 400);
    req = { mode: "theme", theme, continent, country, region, layers, size };
    label = `${THEME_NAMES[theme]} in ${region ? region.name + ", " + country.name : country ? country.name : continent}`;
  } else return J({ ok: false, error: "Start with a place or a theme." }, 400);

  const email = w.email, owner = w.role === "owner";
  const busy = await env.MEMBERS.prepare("SELECT id FROM custom_maps WHERE email = ?1 AND status IN ('queued','building') LIMIT 1").bind(email).first();
  if (busy) return J({ ok: false, error: "One map at a time: your current map is still being made.", busy: busy.id }, 409);
  if ((await aiSpentToday(env)) >= AI_CAP_USD)
    return J({ ok: false, error: "We have paused new maps for today. Please try again tomorrow; no credits were used." }, 429);
  const hold = size + 2;
  const c = await credits(env, email, owner);
  if (c.todayLeft < hold) return J({ ok: false, error: `At most 50 credits a day; ${c.todayLeft} left today. Choose fewer spots or try tomorrow.`, credits: c }, 429);
  if (c.available < hold) return J({ ok: false, error: `This map needs up to ${hold} credits; you have ${c.available} left this month.`, credits: c }, 402);

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const steps = ["Choosing the spots", "Checking the pins", "Finding where to stand", "Writing the spot texts", "Finding photos", "Final checks"];
  await env.MEMBERS.prepare("INSERT INTO custom_maps (id, email, made, status, request, label, size, hold, step, progress) VALUES (?1, ?2, ?3, 'queued', ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(id, email, now(), JSON.stringify(req), label, size, hold, "Waiting for the map builder",
          JSON.stringify({ steps: steps.map((name) => ({ name, done: false })), spots: [] })).run();
  await ledger(env, email, hold, "hold", id, `held for ${size} spots`);
  return J({ ok: true, id, label, hold, credits: await credits(env, email, owner) });
}

// Custom maps C2: the member's maps (newest first) and credits; ?id= returns one map (for the progress screen).
import { proUser, credits, publicMap, J } from "../../_lib/custom.js";

export async function onRequestGet({ request, env }) {
  const w = await proUser(request, env);
  if (!w) return J({ ok: false, error: "Custom maps are part of Pro." }, 401);
  if (!env.MEMBERS) return J({ ok: false, error: "Not available right now." }, 503);
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const r = await env.MEMBERS.prepare("SELECT * FROM custom_maps WHERE id = ?1 AND (email = ?2 OR (?3 AND email = 'owner'))").bind(id, w.email, w.role === "owner" ? 1 : 0).first();
    // 2026-11-25: when the map builder last reported in (seconds ago), so the waiting screen can say it is offline
    const hb = await env.MEMBERS.prepare("SELECT at FROM build_status WHERE k = 'custom_builder'").first();
    const builderAgo = hb ? Math.max(0, Math.floor(Date.now() / 1000) - hb.at) : null;
    return r ? J({ ok: true, map: publicMap(r), builderAgo }) : J({ ok: false, error: "Map not found." }, 404);
  }
  const rows = (await env.MEMBERS.prepare("SELECT * FROM custom_maps WHERE (email = ?1 OR (?2 AND email = 'owner')) AND status != 'removed' ORDER BY made DESC LIMIT 50").bind(w.email, w.role === "owner" ? 1 : 0).all()).results;
  return J({ ok: true, maps: rows.map(publicMap), credits: await credits(env, w.email, w.role === "owner") });
}

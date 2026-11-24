// Custom maps C2: the member's maps (newest first) and credits; ?id= returns one map (for the progress screen).
import { proUser, credits, publicMap, J } from "../../_lib/custom.js";

export async function onRequestGet({ request, env }) {
  const w = await proUser(request, env);
  if (!w) return J({ ok: false, error: "Custom maps are part of Pro." }, 401);
  if (!env.MEMBERS) return J({ ok: false, error: "Not available right now." }, 503);
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const r = await env.MEMBERS.prepare("SELECT * FROM custom_maps WHERE id = ?1 AND email = ?2").bind(id, w.email).first();
    return r ? J({ ok: true, map: publicMap(r) }) : J({ ok: false, error: "Map not found." }, 404);
  }
  const rows = (await env.MEMBERS.prepare("SELECT * FROM custom_maps WHERE email = ?1 ORDER BY made DESC LIMIT 50").bind(w.email).all()).results;
  return J({ ok: true, maps: rows.map(publicMap), credits: await credits(env, w.email, w.role === "owner") });
}

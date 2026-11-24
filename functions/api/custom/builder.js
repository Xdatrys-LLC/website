// Custom maps C2: the map builder's side of the queue (this PC now, the Droplet later; header X-Builder-Key).
//   POST {action:"claim", by}                 -> the oldest waiting map, marked building (or {map:null})
//   POST {action:"update", id, step?, progress?, ai_cost_add?, status?, used?, result?, error?}
//        status "done": charge 'used' credits (never more than the hold), give the rest back
//        status "failed": give all held credits back
import { isBuilder, ledger, J, now } from "../../_lib/custom.js";

export async function onRequestPost({ request, env }) {
  if (!isBuilder(request, env)) return J({ ok: false }, 401);
  let b; try { b = await request.json(); } catch { return J({ ok: false }, 400); }
  if (b.action === "claim") {
    const r = await env.MEMBERS.prepare("UPDATE custom_maps SET status = 'building', started = ?1, claimed_by = ?2, step = 'Choosing the spots' " +
      "WHERE id = (SELECT id FROM custom_maps WHERE status = 'queued' ORDER BY made LIMIT 1) RETURNING *").bind(now(), String(b.by || "builder").slice(0, 40)).first();
    return J({ ok: true, map: r ? { ...r, request: JSON.parse(r.request) } : null });
  }
  if (b.action === "update") {
    const r = await env.MEMBERS.prepare("SELECT * FROM custom_maps WHERE id = ?1").bind(String(b.id || "")).first();
    if (!r) return J({ ok: false, error: "no such map" }, 404);
    if (r.status !== "building") return J({ ok: false, error: "map is " + r.status }, 409);
    const sets = [], vals = [];
    const put = (col, v) => { sets.push(`${col} = ?${vals.length + 1}`); vals.push(v); };
    if (b.step) put("step", String(b.step).slice(0, 120));
    if (b.progress) put("progress", JSON.stringify(b.progress));
    if (b.ai_cost_add) put("ai_cost", (r.ai_cost || 0) + Math.max(0, +b.ai_cost_add || 0));
    if (b.status === "done") {
      const used = Math.max(0, Math.min(r.hold, Math.round(+b.used || 0)));
      put("status", "done"); put("used", used); put("finished", now()); put("step", "Your map is ready");
      if (b.result) put("result", JSON.stringify(b.result));
      if (r.hold - used) await ledger(env, r.email, -(r.hold - used), "release", r.id, `charged ${used} of ${r.hold}`);
    } else if (b.status === "failed") {
      put("status", "failed"); put("used", 0); put("finished", now()); put("error", String(b.error || "").slice(0, 300) || null);
      if (r.hold) await ledger(env, r.email, -r.hold, "release", r.id, "failed");
    }
    if (!sets.length) return J({ ok: true });
    vals.push(r.id);
    await env.MEMBERS.prepare(`UPDATE custom_maps SET ${sets.join(", ")} WHERE id = ?${vals.length}`).bind(...vals).run();
    return J({ ok: true });
  }
  return J({ ok: false, error: "unknown action" }, 400);
}

// Custom maps C2: cancel a map that is still waiting in the queue; its held credits are given back.
import { proUser, ledger, J, now } from "../../_lib/custom.js";

export async function onRequestPost({ request, env }) {
  const w = await proUser(request, env);
  if (!w) return J({ ok: false, error: "Custom maps are part of Pro." }, 401);
  let b; try { b = await request.json(); } catch { return J({ ok: false }, 400); }
  const r = await env.MEMBERS.prepare("UPDATE custom_maps SET status = 'cancelled', finished = ?3, step = 'Cancelled' WHERE id = ?1 AND email = ?2 AND status = 'queued' RETURNING hold")
    .bind(String(b.id || ""), w.email, now()).first();
  if (!r) return J({ ok: false, error: "Only a map that has not started can be cancelled." }, 409);
  if (r.hold) await ledger(env, w.email, -r.hold, "release", b.id, "cancelled");
  return J({ ok: true });
}

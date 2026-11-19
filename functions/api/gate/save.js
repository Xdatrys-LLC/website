// POST /api/gate/save (2026-11-16, Gate_Auto_Apply_Spec): the owner's correction map sends its current corrections for one map.
// Body: {map, snap, data: {map, made, changes: [...]}} (the same JSON as "Copy corrections"). Owner only.
// The newest snapshot per map replaces any older one still waiting; pipeline/gate_inbox.py on Ifan's PC applies it.
import { who, now, J } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const w = await who(request, env);
  if (w.role !== "owner") return J({ ok: false, error: "owner only" }, 401);
  const raw = await request.text();
  if (raw.length > 300000) return J({ ok: false, error: "too large" }, 413);
  let b; try { b = JSON.parse(raw); } catch (e) { return J({ ok: false, error: "bad JSON" }, 400); }
  if (!/^[a-z]{2,30}$/.test(b.map || "") || typeof b.snap !== "string" || b.snap.length > 40 || !b.data || !Array.isArray(b.data.changes))
    return J({ ok: false, error: "bad request" }, 400);
  if (b.data.map !== b.map) return J({ ok: false, error: "map mismatch" }, 400);
  await env.MEMBERS.prepare("UPDATE gate_inbox SET status = 'superseded', done = ? WHERE map = ? AND status = 'pending'").bind(now(), b.map).run();
  const r = await env.MEMBERS.prepare("INSERT INTO gate_inbox (map, snap, body, made, status) VALUES (?, ?, ?, ?, 'pending')")
    .bind(b.map, b.snap, JSON.stringify(b.data), now()).run();
  return J({ ok: true, id: r.meta && r.meta.last_row_id });
}

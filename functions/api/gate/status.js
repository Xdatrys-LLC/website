// GET /api/gate/status?map=<map> (2026-11-16): the newest correction snapshot for one map and whether it has been applied. Owner only.
import { who, J } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  if (w.role !== "owner") return J({ ok: false, error: "owner only" }, 401);
  const map = new URL(request.url).searchParams.get("map") || "";
  if (!/^[a-z]{2,30}$/.test(map)) return J({ ok: false, error: "bad map" }, 400);
  const r = await env.MEMBERS.prepare("SELECT id, snap, status, made, done, note FROM gate_inbox WHERE map = ? AND status != 'superseded' ORDER BY id DESC LIMIT 1")
    .bind(map).first();
  return J({ ok: true, latest: r || null });
}

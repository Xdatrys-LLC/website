// GET /api/build/status (2026-11-16): progress of the library build (map counter, current map and step), written every few
// minutes by pipeline/library_build.py on Ifan's PC. Owner only. Shown by /review/progress/.
import { who, J } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  if (w.role !== "owner") return J({ ok: false, error: "owner only" }, 401);
  const r = await env.MEMBERS.prepare("SELECT v, at FROM build_status WHERE k = 'library'").first();
  return J({ ok: true, now: Math.floor(Date.now() / 1000), status: r ? { ...JSON.parse(r.v), at: r.at } : null });
}

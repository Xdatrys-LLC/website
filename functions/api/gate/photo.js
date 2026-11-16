// /api/gate/photo (2026-11-16, Gate_Auto_Apply_Spec): photos dragged onto a popup on the owner's correction map. Owner only.
// POST ?map=<map>  body = the image file (JPG, PNG or WebP, at most 20 MB) -> stored in R2 (bucket of binding TILES) under
//      gate-photos/<map>/<time>-<random>.<ext>; answers {ok, key}. pipeline/gate_inbox.py fetches it, makes the 480 px thumbnail.
// GET  ?key=gate-photos/...  -> the stored photo, so the correction map can show it before it has been applied.
import { who, now, J } from "../../_lib/auth.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 20 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const w = await who(request, env);
  if (w.role !== "owner") return J({ ok: false, error: "owner only" }, 401);
  if (!env.TILES) return J({ ok: false, error: "storage not connected" }, 503);
  const map = new URL(request.url).searchParams.get("map") || "";
  if (!/^[a-z]{2,30}$/.test(map)) return J({ ok: false, error: "bad map" }, 400);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES[type]) return J({ ok: false, error: "Please use a JPG, PNG or WebP photo." }, 415);
  const len = +(request.headers.get("content-length") || 0);
  if (len > MAX) return J({ ok: false, error: "The photo is larger than 20 MB." }, 413);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX) return J({ ok: false, error: "The photo is empty or larger than 20 MB." }, 413);
  const key = `gate-photos/${map}/${now()}-${crypto.randomUUID().slice(0, 8)}.${TYPES[type]}`;
  await env.TILES.put(key, buf, { httpMetadata: { contentType: type } });
  return J({ ok: true, key });
}

export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  if (w.role !== "owner") return new Response("owner only", { status: 401 });
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^gate-photos\/[a-z]{2,30}\/[0-9]+-[0-9a-f]{8}\.(jpg|png|webp)$/.test(key)) return new Response("bad key", { status: 400 });
  const o = await env.TILES.get(key);
  if (!o) return new Response("not found", { status: 404 });
  return new Response(o.body, { headers: { "content-type": o.httpMetadata && o.httpMetadata.contentType || "image/jpeg", "cache-control": "private, max-age=86400" } });
}

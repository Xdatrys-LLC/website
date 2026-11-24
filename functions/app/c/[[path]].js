// Custom maps (Pro), step C3: a member's finished custom map at /app/c/<id>/..., read from R2 "custom/<id>/..." (pipeline/custom_build.py).
// Only the member who made it (and the owner) can open it. It stays theirs to keep after cancelling (decision Q6), so this checks
// who made the map, not whether the membership is still active. Never indexed by search engines.
import { who } from "../../_lib/auth.js";

const TYPES = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json", jpg: "image/jpeg",
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp", css: "text/css" };

export async function onRequestGet({ request, env, params }) {
  const parts = [].concat(params.path || []);
  const id = parts[0] || "";
  if (!/^[a-f0-9]{16}$/.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  if (parts.length === 1 && !url.pathname.endsWith("/")) return Response.redirect(url.origin + url.pathname + "/" + url.search, 301);
  const rest = parts.slice(1).join("/") || "index.html";
  if (rest.includes("..")) return new Response("Not found", { status: 404 });
  const w = await who(request, env);
  const row = env.MEMBERS && await env.MEMBERS.prepare("SELECT email, status FROM custom_maps WHERE id = ?1").bind(id).first();
  if (!row || row.status !== "done") return new Response("Not found", { status: 404 });
  if (!(w.role === "owner" || (w.email && w.email === row.email))) {
    return (request.headers.get("Accept") || "").includes("text/html")
      ? Response.redirect(url.origin + "/account/?next=" + encodeURIComponent(url.pathname), 302)
      : new Response(JSON.stringify({ ok: false, error: "This map belongs to another member." }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (!env.TILES) return new Response("Not available", { status: 503 });
  const obj = await env.TILES.get(`custom/${id}/${rest}`);
  if (!obj) return new Response("Not found", { status: 404 });
  const ext = (rest.split(".").pop() || "").toLowerCase();
  return new Response(obj.body, { headers: { "content-type": TYPES[ext] || "application/octet-stream",
    "cache-control": "private, max-age=300", "x-robots-tag": "noindex" } });
}

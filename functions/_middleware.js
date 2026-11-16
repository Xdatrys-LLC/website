// Runs before every request on the site.
// 1. 301 www.xdatrys.com -> xdatrys.com, so there is one canonical host (decided 2026-10-20).
// 2. Gatekeeper (Stage 3, 2026-11-16; decision 3l): the map files of the Xdatrys Maps app (/app/m/...) are sent only to
//    signed-in members and the owner; the review and correction maps (/review/...) only to the owner.
//    Map tiles, the app's home screen, the library pages and everything else stay open.
import { who } from "./_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.hostname === "www.xdatrys.com") {
    url.hostname = "xdatrys.com";
    return Response.redirect(url.toString(), 301);
  }
  const p = url.pathname;
  const app = p.startsWith("/app/m/"), review = p.startsWith("/review/");
  if (!app && !review) return context.next();
  const w = await who(request, env);
  const allowed = review ? w.role === "owner" : (w.role === "owner" || w.role === "member");
  if (allowed) {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    out.headers.set("X-Robots-Tag", "noindex");
    return out;
  }
  const page = (request.headers.get("Accept") || "").includes("text/html");
  if (page) {
    const to = review ? "/account/?owner=1&next=" + encodeURIComponent(p + url.search) : "/app/";
    return Response.redirect(url.origin + to, 302);
  }
  return new Response(JSON.stringify({ ok: false, error: "members only" }), {
    status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Runs before every request on the site.
// 1. 301 www.xdatrys.com -> xdatrys.com, so there is one canonical host (decided 2026-10-20).
// 2. Gatekeeper (Stage 3, 2026-11-16; decision 3l): the map files of the Xdatrys Maps app (/app/m/...) are sent only to
//    signed-in members and the owner; the review and correction maps (/review/...) only to the owner.
//    Map tiles, the app's home screen, the library pages and everything else stay open.
// 3. Pocket Lens issue pages (/newsletter/issues/<date> since 2026-11-20; before that /issues/<date>): visitors and search engines get the short public version
//    (_lib/issue_teaser.js); signed-in members and the owner get the full issue. The Pocket Lens project is not changed.
//    Also /newsletter/issues/<date>, where Pocket Lens will publish later. /newsletter/drafts/... is for the owner only.
// 4. /sitemap.xml, /robots.txt, /llms.txt are served from the website's own copies in /site-files/ (pipeline/site_files.py),
//    because the Pocket Lens publisher rewrites the root files every night with only the old pages (2026-11-18).
import { who, readCookie, makeCookie, now, DAY } from "./_lib/auth.js";
import { teaserIssue } from "./_lib/issue_teaser.js";
import { MENU } from "./_lib/site_menu.js";

// 2026-11-20 (Ifan): an issue page that lacks the site menu (published or re-rendered by Pocket Lens after the evening
// newsletter refresh) gets it as it is served, right after <body>, so no visitor ever sees an issue without the menu.
const withMenu = (html) => html.includes("<!-- xd-menu") ? html : html.replace(/<body[^>]*>/, (b) => b + "\n" + MENU + "\n");

const ISSUE = /^\/(newsletter\/)?issues\/\d{4}-\d{2}-\d{2}(\.html)?\/?$/;
const SITE_FILES = { "/sitemap.xml": "/site-files/sitemap.xml", "/robots.txt": "/site-files/robots.txt", "/llms.txt": "/site-files/llms.txt" };

// 2026-11-22 (Ifan): /maps/ (the bio link of the social videos) gets the "Today's Pocket Lens" box under its heading,
// built nightly by pipeline/newsletter_page.py into /site-files/todays-pocket-lens.html. Done here because the /maps/ page
// itself is rewritten by the shot-map tool. The page's own Kit sign-up block is moved into the box (one form on the page).
const MAPS = new Set(["/maps", "/maps/", "/maps/index.html"]);
async function withPocketLens(res, url, env) {
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html") || !env.ASSETS) return res;
  const b = await env.ASSETS.fetch(new Request(url.origin + "/site-files/todays-pocket-lens.html"));
  let html = await res.text();
  if (!b.ok || html.includes("<!-- xd-tpl")) return new Response(html, res);
  let box = await b.text();
  const d = (box.match(/xd-tpl (\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  box = box.replace("{LABEL}", d === today || d === tomorrow ? "Today's Pocket Lens" : "Latest Pocket Lens");
  const su = html.match(/<div style="margin-top:40px">(<div class="signup">[\s\S]*?<\/script>\s*<\/div>)<\/div>/);
  if (su) {
    html = html.replace(su[0], "");
    box = box.replace("<!--XD-SIGNUP-->", su[1]);
  } else {
    box = box.replace("<!--XD-SIGNUP-->", '<div class="signup"><h3>Free Pocket Lens newsletter</h3><p>Smartphone travel photo tips and a new place every day.</p><a class="tpm" href="/subscribe/">Subscribe free &rarr;</a></div>');
  }
  // 2026-11-22 (Ifan): the heading matches the CTA and the page ("Shot Maps & Newsletter")
  html = html.replace(/<h1>Shot <span>Maps<\/span><\/h1>/, "<h1>Shot <span>Maps</span> &amp; <span>Newsletter</span></h1>");
  const at = html.indexOf('<div class="container">');
  html = at > -1 ? html.slice(0, at) + box + html.slice(at) : html.replace("<!-- /xd-menu -->", "<!-- /xd-menu -->\n" + box);
  const out = new Response(html, res);
  out.headers.delete("content-length");
  out.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return out;
}

// 2026-11-22 (Ifan): library map pages (/library/<map>/) get "Featured in Pocket Lens" links to the issues whose Hot Location
// lies on that map, from /site-files/featured-in-pocket-lens.json (pipeline/newsletter_page.py, refreshed nightly).
const LIB = /^\/library\/([a-z0-9-]+)\/?$/;
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
async function withFeatured(res, key, url, env) {
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html") || !env.ASSETS) return res;
  const j = await env.ASSETS.fetch(new Request(url.origin + "/site-files/featured-in-pocket-lens.json"));
  if (!j.ok) return res;
  let list;
  try { list = (await j.json())[key]; } catch (e) { return res; }
  if (!list || !list.length) return res;
  let html = await res.text();
  const items = list.map((i) => `<li><a href="/newsletter/issues/${esc(i.date)}">${esc(i.title)}</a> <span style="color:rgba(255,255,255,.62)">(${esc(i.label)})</span></li>`).join("");
  const box = `<section id="pocket-lens" style="margin:28px 0"><h2>Featured in Pocket Lens</h2><p>This place was in our free daily newsletter:</p><ul>${items}</ul>` +
    `<p><a href="/newsletter/">Get Pocket Lens free</a> &middot; <a href="/newsletter/issues/">All issues</a></p></section>`;
  const at = html.indexOf('<section id="join">');
  if (at < 0) return new Response(html, res);
  html = html.slice(0, at) + box + "\n" + html.slice(at);
  const out = new Response(html, res);
  out.headers.delete("content-length");
  return out;
}

// 2026-11-26 (Ifan: "I will not always be at a pc"): the owner's sign-in renews itself. When the owner opens any page and
// the sign-in is more than 30 days old, a fresh 1-year sign-in is sent with the page, so a phone signed in once stays signed in.
export async function onRequest(context) {
  const res = await handle(context);
  try {
    const c = await readCookie(context.request, context.env);
    if (c && c.role === "owner" && c.x && c.x - now() < 335 * DAY && context.request.method === "GET") {
      const out = new Response(res.body, res);
      out.headers.append("Set-Cookie", await makeCookie(context.env, c.email, "owner", 365));
      return out;
    }
  } catch (e) {}
  return res;
}

async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.hostname === "www.xdatrys.com") {
    url.hostname = "xdatrys.com";
    return Response.redirect(url.toString(), 301);
  }
  const p = url.pathname;
  // search-engine ownership files (Google Search Console, 2026-11-19): served exactly at /googleXXXX.html with 200,
  // because Cloudflare Pages otherwise redirects *.html to the address without .html
  const gv = p.match(/^\/(google[0-9a-f]{8,}\.html)$/);
  if (gv) return new Response("google-site-verification: " + gv[1], { headers: { "content-type": "text/html; charset=utf-8" } });
  if (SITE_FILES[p] && env.ASSETS) {
    const own = await env.ASSETS.fetch(new Request(url.origin + SITE_FILES[p], request));
    if (own.ok) return own;
  }
  // the plain issue list written by the Pocket Lens publisher -> the website's styled list (2026-11-18, Ifan)
  if (p === "/issues" || p === "/issues/" || p === "/issues/index.html" || p === "/issues/index") {
    return Response.redirect(url.origin + "/newsletter/issues/", 301);
  }
  // issues moved from /issues/ to /newsletter/issues/ (2026-11-20, Ifan): old addresses (Kit emails, search results,
  // shared links) answer 301 to the new one, but only when the issue really exists there, so an issue the Pocket Lens
  // publisher still writes to the old folder keeps working until it switches.
  const old = p.match(/^\/issues\/(\d{4}-\d{2}-\d{2}|latest|img\/[^/]+)(\.html)?\/?$/);
  if (old && env.ASSETS) {
    const to = "/newsletter/issues/" + old[1];
    const probe = await env.ASSETS.fetch(new Request(url.origin + to, { method: "GET" }));
    if (probe.ok) return Response.redirect(url.origin + to + url.search, 301);
  }
  if (MAPS.has(p)) return withPocketLens(await context.next(), url, env);
  const lib = p.match(LIB);
  if (lib) return withFeatured(await context.next(), lib[1], url, env);
  if (ISSUE.test(p)) {
    const res = await context.next();
    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return res;
    const w = await who(request, env);
    const html = withMenu(await res.text());
    if (w.role === "owner" || w.role === "member") {
      const full = new Response(html, res);
      full.headers.delete("content-length");
      full.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
      return full;
    }
    const out = new Response(teaserIssue(html), res);
    out.headers.delete("content-length");
    out.headers.set("Vary", "Cookie");
    return out;
  }
  const app = p.startsWith("/app/m/"), review = p.startsWith("/review/") || p.startsWith("/newsletter/drafts/") || p === "/personal" || p.startsWith("/personal/");   // /personal/: owner only (2026-11-26)
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

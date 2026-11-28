// Stage 3: the link in the sign-in email. Opening it (GET) only shows a "Sign in" button, because some email systems
// open links by themselves to scan them, which would use up a one-time link. Pressing the button (POST) signs in.
import { sha256, now, makeCookie, isOwnerEmail } from "../../_lib/auth.js";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const page = body => new Response(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="robots" content="noindex"><title>Sign in · Xdatrys</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;' +
  'background:#09090f;color:#eee;font-family:Montserrat,system-ui,sans-serif;text-align:center;padding:16px}button,a.b{background:#E100FF;color:#fff;' +
  'border:0;border-radius:8px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}</style></head>' +
  '<body><div>' + body + '</div></body></html>',
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
const safeNext = n => (typeof n === "string" && /^\/[A-Za-z0-9/_\-.?=&]*$/.test(n) ? n : "/account/");

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  return page('<h1 style="font-size:22px">Sign in to Xdatrys</h1><form method="post">' +
    '<input type="hidden" name="c" value="' + esc(u.searchParams.get("c") || "") + '">' +
    '<input type="hidden" name="n" value="' + esc(safeNext(u.searchParams.get("n"))) + '"><button>Sign in</button></form>');
}
export async function onRequestPost({ request, env }) {
  const f = await request.formData();
  const h = await sha256(String(f.get("c") || ""));
  const row = await env.MEMBERS.prepare("SELECT email, expires, used FROM login_links WHERE code_hash = ?").bind(h).first();
  if (!row || row.used || row.expires < now())
    return page('<h1 style="font-size:22px">This link has expired or was already used</h1><p><a class="b" href="/account/">Get a new link</a></p>');
  await env.MEMBERS.prepare("UPDATE login_links SET used = 1 WHERE code_hash = ?").bind(h).run();
  const owner = isOwnerEmail(env, row.email);   // 2026-11-27: the owner stays signed in a year (renews itself), like /p
  return new Response(null, { status: 303, headers: { Location: safeNext(f.get("n")), "Set-Cookie": await makeCookie(env, row.email, owner ? "owner" : "member", owner ? 365 : 30) } });
}

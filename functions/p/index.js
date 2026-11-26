// 2026-11-25: xdatrys.com/p - type the 6-digit number shown on My account (functions/api/auth/pair.js) to sign in this phone.
// Limits: 10 wrong numbers an hour per visitor (IP hashed with the hour; the IP itself is not stored). Number valid 10 minutes, one use.
import { sha256, now, makeCookie, isOwnerEmail } from "../_lib/auth.js";
const page = (msg, err) => new Response(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="robots" content="noindex"><title>Sign in this phone · Xdatrys</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;' +
  'background:#09090f;color:#eee;font-family:Montserrat,system-ui,sans-serif;text-align:center;padding:16px}' +
  'input{font-size:34px;letter-spacing:8px;width:220px;text-align:center;padding:12px;border-radius:10px;border:2px solid #00C2FF;background:#16161f;color:#fff}' +
  'button{margin-top:18px;background:#FF00FF;color:#fff;border:0;border-radius:10px;padding:16px 40px;font-size:18px;font-weight:700}' +
  '.e{color:#ff8a8a;margin-top:14px}</style></head><body><form method="post"><h1 style="font-size:22px">Sign in this phone</h1>' +
  '<p>Type the number shown on My account on your computer.</p>' +
  '<input name="c" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" autofocus>' +
  '<br><button>Sign in</button>' + (err ? '<p class="e">' + err + '</p>' : '') + (msg || '') + '</form></body></html>',
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
export const onRequestGet = () => page();
export async function onRequestPost({ request, env }) {
  const t = now();
  const ipKey = "pf:" + (await sha256((request.headers.get("CF-Connecting-IP") || "") + "|" + Math.floor(t / 3600) + "|xd-pair")).slice(0, 29);
  const bad = await env.MEMBERS.prepare("SELECT COUNT(*) AS n FROM login_links WHERE ip_key = ?1 AND made > ?2").bind(ipKey, t - 3600).first();
  if (bad && bad.n >= 10) return page("", "Too many wrong numbers. Please wait an hour.");
  const code = String((await request.formData()).get("c") || "").replace(/\D/g, "");
  const row = /^\d{6}$/.test(code) && await env.MEMBERS.prepare("SELECT email, expires, used FROM login_links WHERE code_hash = ? AND ip_key = 'pair'")
    .bind(await sha256("pair|" + code)).first();
  if (!row || row.used || row.expires < t) {
    await env.MEMBERS.prepare("INSERT INTO login_links (code_hash, email, expires, used, made, ip_key) VALUES (?,?,?,1,?,?)")
      .bind("x" + crypto.randomUUID(), "", t, t, ipKey).run();
    return page("", "That number did not work. Check it, or press the button on your computer again for a new one.");
  }
  await env.MEMBERS.prepare("UPDATE login_links SET used = 1 WHERE code_hash = ?").bind(await sha256("pair|" + code)).run();
  const owner = row.email === "owner" || isOwnerEmail(env, row.email);
  return new Response(null, { status: 303, headers: { Location: owner ? "/app/create/" : "/app/",
    "Set-Cookie": await makeCookie(env, row.email, owner ? "owner" : "member", owner ? 365 : 30) } });
}

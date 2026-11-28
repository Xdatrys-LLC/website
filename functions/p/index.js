// 2026-11-25: xdatrys.com/p - type the 6-digit number shown on My account (functions/api/auth/pair.js) to sign in this phone.
// 2026-11-27 (Ifan: sign in on the phone with no PC and no email): the same box also takes the owner's own 4-digit passcode.
// The passcode is chosen by the owner on this page while signed in; only a keyed hash is stored (table owner_pass).
// A 4-digit code is short, so guessing is limited across ALL visitors: 5 wrong tries pause it for 24 hours, and 30 wrong tries
// without a success switch it off until the owner sets it again. The 6-digit number keeps working either way.
// Limits for numbers: 10 wrong an hour per visitor (IP hashed with the hour; the IP itself is not stored); valid 10 minutes, one use.
import { sha256, now, makeCookie, isOwnerEmail, who } from "../_lib/auth.js";

const PAUSE_AFTER = 5, PAUSE = 86400, OFF_AFTER = 30;
const OWNER_HOME = "/personal/";

const html = body => new Response(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="robots" content="noindex"><title>Sign in this phone · Xdatrys</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;' +
  'background:#09090f;color:#eee;font-family:Montserrat,system-ui,sans-serif;text-align:center;padding:16px}form{max-width:340px}' +
  'input{font-size:34px;letter-spacing:8px;width:220px;text-align:center;padding:12px;border-radius:10px;border:2px solid #00C2FF;background:#16161f;color:#fff;margin-top:10px}' +
  'button{margin-top:18px;background:#FF00FF;color:#fff;border:0;border-radius:10px;padding:16px 40px;font-size:18px;font-weight:700}' +
  'a{color:#00C2FF}.e{color:#ff8a8a;margin-top:14px}.ok{color:#7dffb0}</style></head><body><div>' + body + '</div></body></html>',
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });

const signInPage = err => html('<form method="post"><h1 style="font-size:22px">Sign in this phone</h1>' +
  '<p>Type your 4-digit passcode, or the 6-digit number shown on My account.</p>' +
  '<input name="c" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" autofocus>' +
  '<br><button>Sign in</button>' + (err ? '<p class="e">' + err + '</p>' : '') + '</form>');

const box = (name, label) => '<p style="margin:18px 0 0">' + label + '</p><input name="' + name +
  '" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required>';

const setPage = (has, msg, err) => html('<form method="post"><h1 style="font-size:22px">' + (has ? "Change your passcode" : "Set your passcode") + '</h1>' +
  (msg ? '<p class="ok">' + msg + '</p>' : '<p>You are signed in as owner. Choose 4 digits to sign in here without your PC or email.</p>') +
  box("new1", "New passcode") + box("new2", "The same again") + '<br><button>Save passcode</button>' +
  (err ? '<p class="e">' + err + '</p>' : '') + '<p><a href="' + OWNER_HOME + '">Go to Personal</a></p></form>');

const hashPass = (env, code) => sha256(env.SESSION_SECRET + "|owner-pass|" + code);
const weak = c => /^(\d)\1{3}$/.test(c) || ["1234", "4321", "0123", "2580"].includes(c);
const stored = env => env.MEMBERS.prepare("SELECT 1 AS y FROM owner_pass WHERE id = 1").first();

export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  return w.role === "owner" ? setPage(!!(await stored(env))) : signInPage();
}

export async function onRequestPost({ request, env }) {
  const f = await request.formData();
  if (f.has("new1")) return setPass(request, env, f);
  const code = String(f.get("c") || "").replace(/\D/g, "");
  return code.length === 4 ? passSignIn(env, code) : numberSignIn(request, env, code);
}

async function setPass(request, env, f) {
  const w = await who(request, env);
  // only the signed-in owner, and only from this page (the sign-in cookie is SameSite=Lax; the Origin check is a second guard)
  const origin = request.headers.get("Origin");
  if (w.role !== "owner" || (origin && origin !== new URL(request.url).origin)) return signInPage("Please sign in first.");
  const a = String(f.get("new1") || ""), b = String(f.get("new2") || ""), has = !!(await stored(env));
  if (!/^\d{4}$/.test(a)) return setPage(has, "", "Use exactly 4 digits.");
  if (a !== b) return setPage(has, "", "The two did not match. Please try again.");
  if (weak(a)) return setPage(has, "", "That one is too easy to guess. Choose another.");
  await env.MEMBERS.prepare("INSERT INTO owner_pass (id, hash) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET hash = ?1, tries = 0, total = 0, locked_until = 0")
    .bind(await hashPass(env, a)).run();
  return setPage(true, "Passcode saved.");
}

async function passSignIn(env, code) {
  const t = now();
  if (!(await stored(env))) return signInPage("No passcode is set yet. First sign in with the 6-digit number from My account; you will then be asked to choose your passcode.");
  const closed = "The passcode is not available now. Use the 6-digit number from My account, or try again tomorrow.";
  await env.MEMBERS.prepare("UPDATE owner_pass SET tries = 0, locked_until = 0 WHERE id = 1 AND locked_until > 0 AND locked_until <= ?1").bind(t).run();
  // count the try BEFORE comparing, in one statement, so many tries sent at once cannot slip past the limit
  const row = await env.MEMBERS.prepare("UPDATE owner_pass SET tries = tries + 1, total = total + 1 WHERE id = 1 AND locked_until = 0 AND tries < ?1 AND total < ?2 RETURNING hash, tries")
    .bind(PAUSE_AFTER, OFF_AFTER).first();
  if (!row) return signInPage(closed);
  if (row.hash !== await hashPass(env, code)) {
    if (row.tries < PAUSE_AFTER) return signInPage("That did not work. Check it and try again.");
    await env.MEMBERS.prepare("UPDATE owner_pass SET locked_until = ?1 WHERE id = 1").bind(t + PAUSE).run();
    return signInPage(closed);
  }
  await env.MEMBERS.prepare("UPDATE owner_pass SET tries = 0, total = 0, locked_until = 0 WHERE id = 1").run();
  return new Response(null, { status: 303, headers: { Location: OWNER_HOME, "Set-Cookie": await makeCookie(env, "owner", "owner", 365) } });
}

async function numberSignIn(request, env, code) {
  const t = now();
  const ipKey = "pf:" + (await sha256((request.headers.get("CF-Connecting-IP") || "") + "|" + Math.floor(t / 3600) + "|xd-pair")).slice(0, 29);
  const bad = await env.MEMBERS.prepare("SELECT COUNT(*) AS n FROM login_links WHERE ip_key = ?1 AND made > ?2").bind(ipKey, t - 3600).first();
  if (bad && bad.n >= 10) return signInPage("Too many wrong numbers. Please wait an hour.");
  const row = /^\d{6}$/.test(code) && await env.MEMBERS.prepare("SELECT email, expires, used FROM login_links WHERE code_hash = ? AND ip_key = 'pair'")
    .bind(await sha256("pair|" + code)).first();
  if (!row || row.used || row.expires < t) {
    await env.MEMBERS.prepare("INSERT INTO login_links (code_hash, email, expires, used, made, ip_key) VALUES (?,?,?,1,?,?)")
      .bind("x" + crypto.randomUUID(), "", t, t, ipKey).run();
    return signInPage("That did not work. Check it, or press the button on your computer again for a new number.");
  }
  await env.MEMBERS.prepare("UPDATE login_links SET used = 1 WHERE code_hash = ?").bind(await sha256("pair|" + code)).run();
  const owner = row.email === "owner" || isOwnerEmail(env, row.email);
  return new Response(null, { status: 303, headers: { Location: owner ? ((await stored(env)) ? OWNER_HOME : "/p") : "/app/",
    "Set-Cookie": await makeCookie(env, row.email, owner ? "owner" : "member", owner ? 365 : 30) } });
}

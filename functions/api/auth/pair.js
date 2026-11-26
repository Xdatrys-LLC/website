// 2026-11-25 (Ifan: "give me a simple url that i can tap into my phone"): sign in another device without email.
// A signed-in member or the owner presses "Sign in your phone" on My account; this makes a 6-digit number, valid 10 minutes, one use.
// On the phone: xdatrys.com/p, type the number (functions/p/index.js). Only the hash of the number is stored (table login_links).
import { J, who, sha256, now } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  const w = await who(request, env);
  if (w.role === "none" || !w.email) return J({ ok: false, error: "Please sign in first." }, 401);
  const t = now();
  const n = await env.MEMBERS.prepare("SELECT COUNT(*) AS n FROM login_links WHERE email = ?1 AND ip_key = 'pair' AND made > ?2").bind(w.email, t - 3600).first();
  if (n && n.n >= 10) return J({ ok: false, error: "Too many numbers this hour. Please wait a little." }, 429);
  const r = new Uint32Array(1); crypto.getRandomValues(r);
  const code = String(100000 + (r[0] % 900000));
  await env.MEMBERS.prepare("INSERT INTO login_links (code_hash, email, expires, used, made, ip_key) VALUES (?,?,?,0,?,'pair')")
    .bind(await sha256("pair|" + code), w.email, t + 600, t).run();
  return J({ ok: true, code, minutes: 10 });
}

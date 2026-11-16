// Stage 3: "email me a sign-in link". Sends a one-time link (valid 15 minutes) only to addresses with a membership or
// the owner; always gives the same answer, so the form does not reveal who is a member. Limits: 5 links an hour per
// address, 20 an hour per visitor (IP hashed with the hour; the IP address itself is not stored). Turnstile when set up.
import { J, cleanEmail, validEmail, sha256, now, member, hasAccess, isOwnerEmail } from "../../_lib/auth.js";
const SAME = { ok: true, message: "If that address has a membership, a sign-in link is on its way. It works for 15 minutes." };

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) return J({ ok: false, error: "Sign-in emails are not switched on yet." }, 503);
  let b; try { b = await request.json(); } catch { return J({ ok: false, error: "bad request" }, 400); }
  if (b.website) return J(SAME);                                              // honeypot: robots fill every field
  const email = cleanEmail(b.email);
  if (!validEmail(email)) return J({ ok: false, error: "Please check the email address." }, 400);
  if (env.TURNSTILE_SECRET) {
    const f = new FormData(); f.append("secret", env.TURNSTILE_SECRET); f.append("response", b.ts || "");
    f.append("remoteip", request.headers.get("CF-Connecting-IP") || "");
    const v = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f })).json();
    if (!v.success) return J({ ok: false, error: "The robot check failed. Please try again." }, 400);
  }
  const t = now();
  const ipKey = (await sha256((request.headers.get("CF-Connecting-IP") || "") + "|" + Math.floor(t / 3600) + "|xd-login")).slice(0, 32);
  const n = await env.MEMBERS.prepare("SELECT SUM(email = ?1) AS e, SUM(ip_key = ?2) AS i FROM login_links WHERE made > ?3")
    .bind(email, ipKey, t - 3600).first();
  if (n && (n.e >= 5 || n.i >= 20)) return J({ ok: false, error: "Too many requests. Please wait an hour." }, 429);
  const m = await member(env, email);
  if (!hasAccess(m) && !(m && m.stripe_customer) && !isOwnerEmail(env, email)) {
    await env.MEMBERS.prepare("INSERT INTO login_links (code_hash, email, expires, used, made, ip_key) VALUES (?,?,?,1,?,?)")
      .bind("x" + crypto.randomUUID(), email, t, t, ipKey).run();              // counts towards the limits, sends nothing
    return J(SAME);
  }
  const raw = new Uint8Array(32); crypto.getRandomValues(raw);
  const code = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await env.MEMBERS.prepare("INSERT INTO login_links (code_hash, email, expires, used, made, ip_key) VALUES (?,?,?,0,?,?)")
    .bind(await sha256(code), email, t + 900, t, ipKey).run();
  const next = typeof b.next === "string" && /^\/[A-Za-z0-9/_\-.?=&]*$/.test(b.next) ? b.next : "/account/";
  const link = `${env.SITE_URL}/api/auth/verify?c=${code}&n=${encodeURIComponent(next)}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM, to: [email], subject: "Your Xdatrys sign-in link",
      text: `Tap this link to sign in to Xdatrys (it works once, for 15 minutes):\n\n${link}\n\nIf you did not ask for it, ignore this email.`,
      html: `<p>Tap the button to sign in to Xdatrys. It works once, for 15 minutes.</p><p><a href="${link}" style="display:inline-block;background:#E100FF;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to Xdatrys</a></p><p style="color:#666;font-size:13px">If you did not ask for this email, ignore it.</p>`,
    }),
  });
  if (!r.ok) return J({ ok: false, error: "The email could not be sent. Please try again later." }, 502);
  return J(SAME);
}
export const onRequestGet = () => J({ ok: false, error: "use POST" }, 405);

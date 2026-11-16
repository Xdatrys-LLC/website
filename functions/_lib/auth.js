// Stage 3 (2026-11-16): shared sign-in and membership helpers for the Pages Functions. Not a page (no request handlers).
// Sign-in cookie "xd_s" = base64url(JSON {e: email, r: role, x: expiry}) + "." + HMAC-SHA256 signature (secret SESSION_SECRET).
// HttpOnly, Secure, SameSite=Lax. Members are re-checked in the D1 database (binding MEMBERS) on every locked request,
// so an ended membership stops at once; the owner (signed in with the owner link) is trusted from the signature alone.
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ub64 = s => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
export const COOKIE = "xd_s";
export const DAY = 86400;

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function hmacHex(secret, text) {
  const s = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(text));
  return [...new Uint8Array(s)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export const now = () => Math.floor(Date.now() / 1000);
export const cleanEmail = e => (typeof e === "string" ? e.trim().toLowerCase() : "");
export const validEmail = e => e.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(e);

export async function makeCookie(env, email, role, days) {
  const body = btoa(JSON.stringify({ e: email, r: role, x: now() + days * DAY })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode(body)));
  return `${COOKIE}=${body}.${sig}; Path=/; Max-Age=${days * DAY}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function readCookie(request, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)xd_s=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET),
      Uint8Array.from(ub64(m[2]), c => c.charCodeAt(0)), enc.encode(m[1]));
    if (!ok) return null;
    const p = JSON.parse(ub64(m[1]));
    return p.x > now() ? { email: p.e, role: p.r } : null;
  } catch { return null; }
}

// Access rule: active or trialing; past_due keeps access for 7 days after the paid period while Stripe retries the card.
export function hasAccess(m) {
  if (!m) return false;
  if (m.status === "active" || m.status === "trialing") return true;
  return m.status === "past_due" && (m.paid_until || 0) + 7 * DAY > now();
}
export async function member(env, email) {
  if (!env.MEMBERS || !email) return null;
  return env.MEMBERS.prepare("SELECT * FROM members WHERE email = ?").bind(email).first();
}
export function isOwnerEmail(env, email) {
  return !!email && (env.OWNER_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean).includes(email);
}
// Who is asking: {email, role: "owner"|"member"|"none", member row}
export async function who(request, env) {
  const c = await readCookie(request, env);
  if (!c) return { email: null, role: "none", m: null };
  if (c.role === "owner" || isOwnerEmail(env, c.email)) return { email: c.email, role: "owner", m: await member(env, c.email) };
  const m = await member(env, c.email);
  return { email: c.email, role: hasAccess(m) ? "member" : "none", m };
}
export const J = (o, st = 200, headers = {}) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

// Stripe (form-encoded REST API); the secret key stays on the server.
export async function stripe(env, path, params, method) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: method || (body ? "POST" : "GET"), body,
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
  });
  const j = await r.json();
  if (!r.ok) throw new Error("stripe " + r.status + " " + ((j.error && j.error.message) || ""));
  return j;
}
export function planOf(env, priceId) {
  if (priceId === env.PRICE_EXPLORER_MONTH) return ["explorer", "month"];
  if (priceId === env.PRICE_EXPLORER_YEAR) return ["explorer", "year"];
  return ["unknown", ""];
}
// Write a subscription into the members table (from the webhook or the Welcome page).
export async function saveSubscription(env, email, sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const [plan, interval] = planOf(env, item && item.price && item.price.id);
  const until = sub.current_period_end || (item && item.current_period_end) || 0;   // field moved to the item in newer Stripe versions
  const t = new Date().toISOString();
  await env.MEMBERS.prepare(
    `INSERT INTO members (email, stripe_customer, plan, interval, status, paid_until, cancel_at_end, created, updated)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(email) DO UPDATE SET stripe_customer=?2, plan=?3, interval=?4, status=?5, paid_until=?6, cancel_at_end=?7, updated=?8`)
    .bind(email, sub.customer, plan, interval, sub.status, until, sub.cancel_at_period_end ? 1 : 0, t).run();
}

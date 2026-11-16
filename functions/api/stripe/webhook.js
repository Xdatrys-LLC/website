// Stage 3: Stripe tells us here when someone pays, renews, fails a payment or cancels. Every message is checked against
// Stripe's signature (secret STRIPE_WEBHOOK_SECRET, 5-minute window) and handled once (table stripe_events).
// The subscription is always re-read from Stripe, so messages arriving out of order cannot leave a wrong state.
import { J, hmacHex, safeEq, now, stripe, saveSubscription, cleanEmail } from "../../_lib/auth.js";

async function emailFor(env, customer) {
  const r = await env.MEMBERS.prepare("SELECT email FROM members WHERE stripe_customer = ?").bind(customer).first();
  if (r) return r.email;
  const c = await stripe(env, "customers/" + customer);
  return cleanEmail(c.email);
}
export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const sig = request.headers.get("Stripe-Signature") || "";
  const t = (sig.match(/(?:^|,)t=(\d+)/) || [])[1];
  const v1s = [...sig.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map(m => m[1]);
  if (!t || !v1s.length || Math.abs(now() - +t) > 300) return J({ ok: false }, 400);
  const want = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${payload}`);
  if (!v1s.some(v => safeEq(v, want))) return J({ ok: false }, 400);
  const ev = JSON.parse(payload);
  const seen = await env.MEMBERS.prepare("SELECT id FROM stripe_events WHERE id = ?").bind(ev.id).first();
  if (seen) return J({ ok: true, duplicate: true });
  const o = ev.data.object;
  let subId = null, email = null;
  if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
    subId = o.subscription; email = cleanEmail((o.customer_details && o.customer_details.email) || o.customer_email);
  } else if (ev.type.startsWith("customer.subscription.")) {
    subId = o.id;
  } else if (ev.type === "invoice.paid" || ev.type === "invoice.payment_failed") {
    subId = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
  }
  if (subId) {
    const sub = await stripe(env, "subscriptions/" + subId);
    if (!email) email = await emailFor(env, sub.customer);
    if (email) await saveSubscription(env, email, sub);
  }
  await env.MEMBERS.prepare("INSERT INTO stripe_events (id, type, made) VALUES (?,?,?)").bind(ev.id, ev.type, new Date().toISOString()).run();
  return J({ ok: true });
}

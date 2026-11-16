// Stage 3: called by the Welcome page after Stripe Checkout. Checks the payment with Stripe (never trusts the browser),
// records the membership (in case Stripe's webhook is slower) and signs the new member in on this browser.
import { J, stripe, saveSubscription, makeCookie, cleanEmail, now } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const s = new URL(request.url).searchParams.get("s") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(s)) return J({ ok: false, error: "bad request" }, 400);
  try {
    const cs = await stripe(env, `checkout/sessions/${s}?expand[]=subscription`);
    if (cs.status !== "complete" || !cs.subscription || now() - cs.created > 86400) return J({ ok: false, error: "This payment is not complete." }, 400);
    const email = cleanEmail((cs.customer_details && cs.customer_details.email) || cs.customer_email);
    await saveSubscription(env, email, cs.subscription);
    return J({ ok: true, email }, 200, { "Set-Cookie": await makeCookie(env, email, "member", 30) });
  } catch (e) {
    return J({ ok: false, error: "We could not check the payment yet. Please reload in a minute." }, 502);
  }
}

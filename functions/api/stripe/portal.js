// Stage 3: open Stripe's customer portal (change plan, update card, invoices, cancel) for the signed-in member.
import { who, J, stripe } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  const w = await who(request, env);
  if (!w.m || !w.m.stripe_customer) return J({ ok: false, error: "No membership found for this sign-in." }, 404);
  try {
    const s = await stripe(env, "billing_portal/sessions", { customer: w.m.stripe_customer, return_url: env.SITE_URL + "/account/" });
    return J({ ok: true, url: s.url });
  } catch (e) {
    return J({ ok: false, error: "The account page at Stripe could not be opened. Please try again." }, 502);
  }
}

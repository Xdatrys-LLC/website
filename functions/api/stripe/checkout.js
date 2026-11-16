// Stage 3: start a Stripe Checkout payment page for Explorer (monthly or yearly). Decision S2: Explorer only at launch.
import { who, J, stripe } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  let b = {}; try { b = await request.json(); } catch {}
  const price = b.interval === "year" ? env.PRICE_EXPLORER_YEAR : env.PRICE_EXPLORER_MONTH;
  const w = await who(request, env);
  if (w.role === "member") return J({ ok: false, error: "You are already a member.", url: "/account/" }, 409);
  const p = {
    mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1",
    success_url: env.SITE_URL + "/welcome/?s={CHECKOUT_SESSION_ID}", cancel_url: env.SITE_URL + "/join/",
    billing_address_collection: "auto", "subscription_data[metadata][site]": "xdatrys",
  };
  if (w.m && w.m.stripe_customer) p.customer = w.m.stripe_customer;
  else if (w.email && w.email !== "owner") p.customer_email = w.email;
  try {
    const s = await stripe(env, "checkout/sessions", p);
    return J({ ok: true, url: s.url });
  } catch (e) {
    return J({ ok: false, error: "The payment page could not be opened. Please try again." }, 502);
  }
}

// Stage 3: who is signed in (used by the menu, the app home, the library and the account page).
import { who, J } from "../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const w = await who(request, env);
  const m = w.m || {};
  return J({
    signedIn: !!w.email, email: w.email && w.email !== "owner" ? w.email : null, role: w.role,
    plan: m.plan || null, interval: m.interval || null, status: m.status || null, paidUntil: m.paid_until || null,
    cancelAtEnd: !!m.cancel_at_end, canManage: !!m.stripe_customer,
    emailsOn: !!env.RESEND_API_KEY, turnstileSiteKey: env.TURNSTILE_SITEKEY || null,
  });
}

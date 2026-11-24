// Custom maps (Pro), step C2 (spec approved 2026-11-24): shared rules for the request queue and the credits.
// Spec section 8: 1 credit per new spot + 2 per map; spots already in the spot bank are free. At Create the worst case
// (size + 2) is held; when the map is finished the unused part is given back; a failed or cancelled map costs nothing.
// Pro: 100 credits a month (UTC calendar month), no roll-over; top-ups (later, step C7) do not expire and are used after
// the month's credits. At most 50 credits a day, one map at a time. Company-wide: no new maps once $50 of AI has been
// spent today (safety stop). The owner has no credit limit (still recorded).
import { who, J, now } from "./auth.js";

export const MONTHLY = 100, DAILY = 50, AI_CAP_USD = 50;
export const SIZES = [5, 10, 20];
export const THEMES = ["top", "landmarks", "architecture", "castles", "religious", "viewpoints", "oldtown", "rivers", "bridges", "coast",
  "mountains", "nature", "gardens", "museums", "markets", "streetart", "night", "ruins"];
export const THEME_NAMES = { landmarks: "Monuments & landmarks", architecture: "Architecture", castles: "Castles & palaces", religious: "Churches & temples",
  viewpoints: "Viewpoints & skylines", oldtown: "Old town & streets", rivers: "Rivers & lakes", bridges: "Bridges", coast: "Beaches & coast",
  mountains: "Mountains", nature: "Nature & waterfalls", gardens: "Parks & gardens", museums: "Museums", markets: "Markets & food",
  streetart: "Street art", night: "Night & lights", ruins: "Ruins", top: "Top sights" };

export const month = (t = now()) => new Date(t * 1000).toISOString().slice(0, 7);
const dayStart = (t = now()) => t - (t % 86400);

// Pro member or owner, else null
export async function proUser(request, env) {
  const w = await who(request, env);
  const pro = w.role === "owner" || (w.role === "member" && (w.m || {}).plan === "pro");
  return pro ? w : null;
}

// Credits left: this month's allowance first, then top-ups
export async function credits(env, email, owner) {
  const rows = (await env.MEMBERS.prepare("SELECT month, kind, SUM(delta) AS d FROM credit_ledger WHERE email = ?1 GROUP BY month, kind").bind(email).all()).results;
  const cur = month();
  let topups = 0, spentThis = 0, overPast = 0;
  const byMonth = {};
  for (const r of rows) {
    if (r.kind === "topup") { topups += -r.d; continue; }
    byMonth[r.month] = (byMonth[r.month] || 0) + r.d;
  }
  for (const [m, s] of Object.entries(byMonth)) {
    if (m === cur) spentThis = s; else overPast += Math.max(0, s - MONTHLY);
  }
  const monthlyLeft = Math.max(0, MONTHLY - spentThis);
  const topupLeft = Math.max(0, topups - overPast - Math.max(0, spentThis - MONTHLY));
  const today = (await env.MEMBERS.prepare("SELECT COALESCE(SUM(delta),0) AS d FROM credit_ledger WHERE email = ?1 AND at >= ?2 AND kind != 'topup'")
    .bind(email, dayStart()).first()).d;
  return { owner: !!owner, monthly: MONTHLY, monthlyLeft, topupLeft, available: owner ? 9999 : monthlyLeft + topupLeft,
           todayLeft: owner ? 9999 : Math.max(0, DAILY - today), month: cur };
}

export async function ledger(env, email, delta, kind, mapId, note) {
  await env.MEMBERS.prepare("INSERT INTO credit_ledger (email, at, month, delta, kind, map_id, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(email, now(), month(), delta, kind, mapId || null, note || null).run();
}

export async function aiSpentToday(env) {
  return (await env.MEMBERS.prepare("SELECT COALESCE(SUM(ai_cost),0) AS c FROM custom_maps WHERE made >= ?1").bind(dayStart()).first()).c;
}

// The map builder (this PC now, the Droplet later) proves itself with the site's owner key (header X-Builder-Key)
export function isBuilder(request, env) {
  const k = request.headers.get("X-Builder-Key") || "";
  return !!env.OWNER_SIGNIN_KEY && k.length > 20 && k === env.OWNER_SIGNIN_KEY;
}

export const publicMap = (r) => r && ({
  id: r.id, status: r.status, label: r.label, size: r.size, made: r.made, step: r.step, hold: r.hold, used: r.used,
  progress: r.progress ? JSON.parse(r.progress) : null, result: r.result ? JSON.parse(r.result) : null,
  error: r.status === "failed" ? (r.error || "Something went wrong; no credits were used.") : null, started: r.started, finished: r.finished,
});
export { J, now };

// Stage 3: the owner's private sign-in link (/api/auth/owner?k=...), kept only in E:/Xdatrys/Maps (never published).
// Gives the owner role (all maps, review and correction maps) on this browser for a year.
import { makeCookie, safeEq } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const k = new URL(request.url).searchParams.get("k") || "";
  if (!env.OWNER_SIGNIN_KEY || !safeEq(k, env.OWNER_SIGNIN_KEY)) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 303, headers: { Location: "/personal/", "Set-Cookie": await makeCookie(env, "owner", "owner", 365), "Referrer-Policy": "no-referrer" } });
}

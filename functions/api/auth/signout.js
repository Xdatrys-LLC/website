// Stage 3: sign out on this browser.
import { clearCookie } from "../../_lib/auth.js";
export const onRequestPost = () => new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": clearCookie() } });

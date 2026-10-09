import { api } from "./api";
import { pushSupported, unregisterPush } from "./push";

let leaving = false;
/** Ends the session on the server, then reloads onto the sign-in page. Always leaves, even if the request fails. */
export async function logout() {
  if (leaving) return;
  leaving = true;
  try { if (pushSupported() && Notification.permission === "granted") await Promise.race([unregisterPush(), new Promise(r => setTimeout(r, 1500))]); } catch { /* push is optional */ }
  try { await api.auth.logout.$post(); } catch { /* the cookie is cleared by the reload below only if the server answered; the server also expires it */ }
  location.replace("/");
}

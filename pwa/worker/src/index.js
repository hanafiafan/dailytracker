// Push notifications for Tugas Harian on Cloudflare Workers (free plan, no billing needed).
//  - POST /notify  : the app reports an event (new task, returned, done, ask); the Worker verifies it and pushes.
//  - cron */15     : deadline reminders and the 08:00 WIB morning reminder.
// Secret: SERVICE_ACCOUNT = the Firebase service-account JSON (wrangler secret put SERVICE_ACCOUNT).

const ORIGINS = ["https://dailytask-a8327.web.app", "https://dailytask-a8327.firebaseapp.com"];
const RECENT = 10 * 60000; // an event may only be announced within 10 minutes of happening

// ---------- Google auth (service account -> access token) ----------
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = s => b64u(new TextEncoder().encode(s));
let tokenCache = { value: "", exp: 0 };
async function accessToken(env) {
  if (tokenCache.exp > Date.now() + 60000) return tokenCache.value;
  const sa = JSON.parse(env.SERVICE_ACCOUNT), iat = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64uStr(JSON.stringify({ iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging" }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----|\s/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${b64u(sig)}` });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}


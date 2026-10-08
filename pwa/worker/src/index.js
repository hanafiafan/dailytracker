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

// ---------- Firestore REST ----------
const dec = v => "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue
  : "booleanValue" in v ? v.booleanValue : "timestampValue" in v ? Date.parse(v.timestampValue)
  : "arrayValue" in v ? (v.arrayValue.values || []).map(dec) : "mapValue" in v ? decFields(v.mapValue.fields) : null;
const decFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
const wrapDoc = d => { const p = d.name.split("/documents/")[1].split("/"); return { path: p.join("/"), id: p[p.length - 1], parent: p[p.length - 3], data: decFields(d.fields) }; };
const base = env => `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;
const enc = p => p.split("/").map(encodeURIComponent).join("/");

async function fs(env, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: "Bearer " + await accessToken(env), "content-type": "application/json" }, body: body && JSON.stringify(body) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`firestore ${r.status}: ${await r.text()}`);
  return r.json();
}
const getDoc = async (env, path) => { const d = await fs(env, "GET", `${base(env)}/${enc(path)}`); return d && wrapDoc(d); };
const listDocs = async (env, path) => ((await fs(env, "GET", `${base(env)}/${enc(path)}?pageSize=300`)) || {}).documents?.map(wrapDoc) || [];
const delDoc = (env, path) => fs(env, "DELETE", `${base(env)}/${enc(path)}`);
const markDoc = (env, path, field) => fs(env, "PATCH", `${base(env)}/${enc(path)}?updateMask.fieldPaths=${field}`, { fields: { [field]: { booleanValue: true } } });
const query = async (env, from, where) => {
  const r = await fs(env, "POST", `${base(env)}:runQuery`, { structuredQuery: { from: [{ collectionId: from, allDescendants: true }], ...(where ? { where } : {}) } });
  return (r || []).filter(x => x.document).map(x => wrapDoc(x.document));
};

// ---------- recipients + sending ----------
// device tokens grouped by email; read once per invocation (the free plan allows only ~50 outgoing requests per run)
async function deviceMap(env) {
  const m = new Map();
  for (const d of await query(env, "devices")) { const e = d.path.split("/")[1]; (m.get(e) || m.set(e, []).get(e)).push(d.id); }
  return m;
}
async function managersOf(env, team, email) {
  const group = (team.find(t => t.id === email) || { data: {} }).data.group || "";
  const out = [env.OWNER_EMAIL.toLowerCase()];
  for (const t of team) {
    if (!t.data.isAdmin || t.id === email) continue;
    const g = Array.isArray(t.data.adminGroups) ? t.data.adminGroups : [];
    if (!g.length || g.includes(group)) out.push(t.id);
  }
  return out;
}
async function push(env, devices, emails, title, body, tag) {
  for (const email of new Set(emails)) {
    for (const token of devices.get(email) || []) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${env.PROJECT_ID}/messages:send`, {
        method: "POST", headers: { authorization: "Bearer " + await accessToken(env), "content-type": "application/json" },
        body: JSON.stringify({ message: { token, data: { title, body, tag: tag || "", url: env.APP_URL }, webpush: { headers: { Urgency: "high", TTL: "86400" } } } }),
      });
      if (r.status === 404 || r.status === 400) await delDoc(env, `tokens/${email}/devices/${token}`); // token no longer valid
    }
  }
}
const nameOf = (team, email) => (team.find(t => t.id === email) || { data: {} }).data.name || email;

// ---------- time helpers (the team lives in WIB, UTC+7 without DST) ----------
const wib = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
};
const atMs = (date, hm) => Date.parse(`${date}T${hm}:00+07:00`);


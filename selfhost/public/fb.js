// Talks to the Tugas Harian server (same origin). Exposes the same small `db` API the app was written against.
const HEAD = { "content-type": "application/json", "x-app": "1" };
const codeOf = s => s === 403 ? "permission-denied" : s === 404 ? "not-found" : s === 401 ? "unauthenticated" : "unavailable";

async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: HEAD, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (_) { throw Object.assign(new Error("offline"), { code: "unavailable" }); }
  if (r.status === 401 && !url.startsWith("/api/auth/")) setUser(null);
  if (!r.ok) throw Object.assign(new Error(`${method} ${url} ${r.status}`), { code: codeOf(r.status) });
  return r.json();
}

// ---------- live updates ----------
// Every active listener re-reads when the server says a matching document changed (or when the connection is back).
const listeners = new Set();
const parentOf = p => p.slice(0, p.lastIndexOf("/"));
let es = null;
function connect() {
  if (es || !listeners.size) return;
  es = new EventSource("/api/events");
  es.onopen = () => listeners.forEach(l => l.run());
  es.onmessage = e => { const { path } = JSON.parse(e.data); listeners.forEach(l => (l.path === path || l.path === parentOf(path)) && l.run()); };
}
function disconnect() { if (es) { es.close(); es = null; } }
function listen(path, read, next, err) {
  let alive = true, busy = false, again = false;
  const l = { path, async run() {
    if (busy) { again = true; return; }
    busy = true;
    try { const v = await read(); if (alive) next(v); } catch (e) { if (alive && err) err(e); }
    busy = false;
    if (again) { again = false; l.run(); }
  } };
  listeners.add(l); connect(); l.run();
  return () => { alive = false; listeners.delete(l); if (!listeners.size) disconnect(); };
}

// ---------- documents ----------
const meta = { fromCache: false, hasPendingWrites: false };
const wrapDoc = d => ({ id: d.id, exists: d.exists !== false, data: () => d.data, metadata: meta });
const wrapCol = docs => { const ds = docs.map(d => wrapDoc({ ...d, exists: true })); return { docs: ds, size: ds.length, empty: !ds.length, metadata: meta }; };
const q = o => new URLSearchParams(o).toString();

function docRef(path) {
  const read = async () => wrapDoc(await api("GET", "/api/doc?" + q({ path })));
  return {
    id: path.split("/").pop(), path,
    get: read,
    set: async (data, opts) => { await api("PUT", "/api/doc?" + q({ path }), { data, merge: !!(opts && opts.merge) }); },
    update: async data => { await api("PATCH", "/api/doc?" + q({ path }), { data }); },
    delete: async () => { await api("DELETE", "/api/doc?" + q({ path })); },
    onSnapshot: (next, err) => listen(path, read, next, err),
    collection: sub => colRef(path + "/" + sub),
  };
}
function queryRef(path, filters) {
  const read = async () => wrapCol((await api("GET", "/api/col?" + q({ path, where: JSON.stringify(filters) }))).docs);
  return {
    where: (f, op, v) => queryRef(path, [...filters, [f, op, v]]),
    get: read,
    onSnapshot: (next, err) => listen(path, read, next, err),
  };
}
function colRef(path) {
  return {
    ...queryRef(path, []), path,
    doc: id => docRef(path + "/" + (id || crypto.randomUUID().replaceAll("-", "").slice(0, 20))),
    add: async data => docRef(path + "/" + (await api("POST", "/api/col?" + q({ path }), { data })).id),
  };
}
export const db = { doc: docRef, collection: colRef };

// ---------- sign-in (Google Identity Services) ----------
const userCbs = new Set();
let user;                                   // undefined = not checked yet
function setUser(u) { user = u; if (!u) disconnect(); userCbs.forEach(cb => cb(u)); }
export function onUser(cb) {
  userCbs.add(cb);
  if (user !== undefined) cb(user);
  else api("GET", "/api/me").then(setUser, () => setUser(null));
  return () => userCbs.delete(cb);
}
export async function signOutUser() { try { await api("POST", "/api/auth/logout", {}); } catch (_) {} setUser(null); }

let gsi;
const loadGsi = () => gsi || (gsi = new Promise((res, rej) => {
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = res; s.onerror = rej;
  document.head.append(s);
}));
// Draws Google's own sign-in button into `el`.
export async function mountGoogleButton(el) {
  const cfg = await (await fetch("/api/config")).json();
  await loadGsi();
  google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async ({ credential }) => {
    try { setUser(await api("POST", "/api/auth/google", { credential })); }
    catch (e) { el.dispatchEvent(new CustomEvent("signin-failed", { bubbles: true })); }
  } });
  google.accounts.id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "id", width: 260 });
}

// ---------- push notifications (Web Push) ----------
export const pushSupported = async () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const keyBytes = b64 => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
export async function registerPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes((await (await fetch("/api/config")).json()).vapidPublicKey) });
  await api("POST", "/api/push/subscribe", { sub: sub.toJSON() });
}
export async function unregisterPush() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch (e) { console.warn("unregister", e); }
}

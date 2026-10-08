// Service worker: keeps the app shell available offline and loads fresh files when online.
const CACHE = "tugas-harian-sh1";
const SHELL = ["./", "./index.html", "./app.js", "./fb.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  // Login pages and the database stay online-only.
  if (!(sameOrigin || fonts) || url.pathname.startsWith("/api/")) return;
  // Network first, falling back to the cached copy when offline.
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});

// Push from Cloud Functions (FCM data message: title, body, tag, url).
self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) {}
  const d = p.data || p;
  e.waitUntil(self.registration.showNotification(d.title || "Tugas Harian", {
    body: d.body || "", icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
    tag: d.tag || undefined, data: { url: d.url || "./" },
  }));
});

// Open (or focus) the app when a notification is tapped.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

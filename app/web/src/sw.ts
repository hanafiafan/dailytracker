/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

// The app shell is precached; the API is never cached (data must be live, and offline writes are not supported).
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));
self.addEventListener("install", () => void self.skipWaiting()); // a new build takes over at once instead of waiting for every tab to close
self.addEventListener("message", e => { if (e.data?.type === "SKIP_WAITING") void self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// Web Push: { title, body, tag, url }
self.addEventListener("push", e => {
  let d: { title?: string; body?: string; tag?: string; url?: string } = {};
  try { d = e.data?.json() ?? {}; } catch { /* not JSON */ }
  e.waitUntil(self.registration.showNotification(d.title || "HAN Task Tracker", {
    body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data as { url?: string } | undefined)?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});

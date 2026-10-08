import { api, ok } from "./api";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

/** Subscribes this device (after the user granted permission) and registers it with the server. */
export async function registerPush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { vapidPublicKey } = await ok(api.config.$get());
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });
  }
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await ok(api.push.subscribe.$post({ json: j }));
}
export async function enablePush() {
  if ((await Notification.requestPermission()) !== "granted") return false;
  await registerPush();
  return true;
}
export async function unregisterPush() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await ok(api.push.unsubscribe.$post({ json: { endpoint: sub.endpoint } })); await sub.unsubscribe(); }
  } catch (e) { console.warn("unregister push", e); }
}

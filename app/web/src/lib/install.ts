import { useSyncExternalStore } from "react";

export interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let saved: InstallEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

// The browser fires "beforeinstallprompt" once, early. It is caught at start-up (this module loads with the app) and kept
// until someone offers it, otherwise a dialog opened later would never see it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); saved = e as InstallEvent; emit(); });
  window.addEventListener("appinstalled", () => { saved = null; installed = true; emit(); });
}

export const installOffer = () => saved;
export const wasInstalled = () => installed;
export function useInstallOffer() {
  return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => saved, () => null);
}
/** Shows the browser's own install dialog. Returns true if the person accepted. */
export async function promptInstall() {
  const e = saved;
  if (!e) return false;
  saved = null; emit(); // a captured prompt can be used only once
  try { await e.prompt(); return (await e.userChoice).outcome === "accepted"; } catch { return false; }
}

// Names used by Onboarding and Cards.
export const useInstallPrompt = useInstallOffer;
export function useJustInstalled() {
  return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => installed, () => false);
}

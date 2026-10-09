import { useSyncExternalStore } from "react";

/** True while the viewport matches the media query (re-renders when it changes). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    cb => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(query).matches,
    () => false,
  );
}
export const useIsMobile = () => useMedia("(max-width: 820px)");

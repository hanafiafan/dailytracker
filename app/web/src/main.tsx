import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./index.css";
import "./lib/install";
import { getTheme, setTheme } from "./lib/theme";

setTheme(getTheme());

// Prevent pinch-to-zoom and gesture zooming on mobile touch devices
if (typeof window !== "undefined") {
  document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", e => e.preventDefault(), { passive: false });
  document.addEventListener("gestureend", e => e.preventDefault(), { passive: false });
  document.addEventListener(
    "touchmove",
    e => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Sync custom RGB / HEX colors on any element with data-c to CSS variable --d
  const syncCustomColors = () => {
    document.querySelectorAll<HTMLElement>("[data-c]").forEach(el => {
      const c = el.getAttribute("data-c");
      if (c && (c.startsWith("#") || c.startsWith("rgb") || c.startsWith("hsl"))) {
        if (el.style.getPropertyValue("--d") !== c) {
          el.style.setProperty("--d", c);
        }
      }
    });
  };
  const obs = new MutationObserver(syncCustomColors);
  obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-c"] });
  window.addEventListener("DOMContentLoaded", syncCustomColors);
  syncCustomColors();
}

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } });
// A new build is picked up while the tab stays open: check on every return to the tab and every 10 minutes, then reload by itself.
if (location.hostname !== "localhost") registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) void reg.update().catch(() => undefined); };
    setInterval(check, 10 * 60_000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  },
}); // local preview: no cache layer, a refresh always shows the latest build
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={qc}><App /></QueryClientProvider></StrictMode>);

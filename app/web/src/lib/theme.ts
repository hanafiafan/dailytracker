import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "th-theme";
const read = (): Theme => { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; } };
const apply = (t: Theme) => {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};
apply(read());

/** Light / dark / follow the system. The choice is remembered on this device. */
export function useTheme() {
  const [theme, set] = useState<Theme>(read);
  useEffect(() => {
    apply(theme);
    try { if (theme === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, theme); } catch { /* private mode */ }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)"), on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return [theme, set] as const;
}

import { parseYmd, ymd } from "@shared/time";

export const DAYN = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
export const STATUS = { todo: "Belum", doing: "Dikerjakan", done: "Selesai" } as const;
export const NEXT = { todo: "doing", doing: "done", done: "todo" } as const;

export const today = () => ymd(new Date());
export const fmtLong = (s: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseYmd(s));
export const fmtShort = (s: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(parseYmd(s));
export const fmtTime = (ms: number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
export const isToday = (ms: number | null | undefined) => !!ms && ymd(new Date(ms)) === today();

export function dur(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + " menit";
  if (m < 1440) return Math.floor(m / 60) + " jam" + (m % 60 ? " " + (m % 60) + " mnt" : "");
  return Math.floor(m / 1440) + " hari";
}
export const hue = (str: string) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = (n: string) => n.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
export const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "") + " ↗"; } catch { return "Buka link ↗"; } };

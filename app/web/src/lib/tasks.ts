import type { Color, Priority, TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { today } from "./format";

/** "Remind before the end time" choices a task giver can pick (minutes). */
export const WARN_OPTIONS: [number, string][] = [[15, "15 menit"], [30, "30 menit (standar)"], [60, "1 jam"], [120, "2 jam"], [240, "4 jam"], [1440, "1 hari"]];

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Rendah", normal: "Normal", high: "Tinggi", urgent: "Mendesak" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const COLOR_LABEL: Record<string, string> = {
  lilac: "Ungu",
  pink: "Merah muda",
  yellow: "Kuning",
  lime: "Lime",
  mint: "Mint",
  sky: "Biru muda",
  peach: "Peach",
  gray: "Abu",
};

export const PRESET_HEX: Record<string, string> = {
  lilac: "#8B5CF6",
  pink: "#EC4899",
  yellow: "#F59E0B",
  lime: "#84CC16",
  mint: "#10B981",
  sky: "#0EA5E9",
  peach: "#F97316",
  gray: "#6B7280",
};

export function colorHex(c?: string | null): string {
  if (!c) return "#8B5CF6";
  const trimmed = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (trimmed.startsWith("rgb")) {
    const match = trimmed.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = Math.min(255, Number(match[0])).toString(16).padStart(2, "0");
      const g = Math.min(255, Number(match[1])).toString(16).padStart(2, "0");
      const b = Math.min(255, Number(match[2])).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
  }
  return PRESET_HEX[trimmed] ?? (trimmed.startsWith("#") ? trimmed : "#8B5CF6");
}

export function colorLabel(c?: string | null): string {
  if (!c) return "";
  return COLOR_LABEL[c] ?? c;
}

export function colorStyle(c?: string | null): React.CSSProperties | undefined {
  if (!c) return undefined;
  if (c.startsWith("#") || c.startsWith("rgb") || c.startsWith("hsl")) {
    return { "--d": c } as React.CSSProperties;
  }
  return undefined;
}

export const sortTasks = (arr: TaskDTO[]) => arr.slice().sort((a, b) => {
  const st = { todo: 0, doing: 0, done: 1 };
  const da = a.start || a.due || "99:99", db = b.start || b.due || "99:99";
  return st[a.status] - st[b.status] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (da < db ? -1 : da > db ? 1 : 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.createdAt - b.createdAt;
});

/** The day's tasks plus (when viewing today) unfinished ones from earlier days. */
export function splitDay(all: TaskDTO[], date: string) {
  return {
    day: sortTasks(all.filter(t => t.date === date)),
    late: date === today() ? sortTasks(all.filter(t => t.date < date && t.status !== "done")) : [],
  };
}
/** Idle = nothing unfinished for today (including leftovers from earlier days). */
export const isIdle = (all: TaskDTO[] | undefined) => !!all && !all.some(t => t.date <= today() && t.status !== "done");

/** Monday of the week containing `date`. */
export function weekStart(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y!, m! - 1, d).getDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
export const subtaskProgress = (t: TaskDTO) => ({ done: t.subtasks.filter(s => s.done).length, total: t.subtasks.length });

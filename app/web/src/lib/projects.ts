import type { ProjectReportDTO, ProjectServiceDTO } from "@shared/schemas";
import { addDays, parseYmd, wib } from "@shared/time";

type T = ProjectReportDTO["tasks"][number];
export type Health = "ok" | "risk" | "late" | "done" | "idle";

const dayOf = (ms: number) => wib(ms).date;
const diffDays = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
export const pct = (a: number, b: number) => (b ? Math.min(100, Math.round(a / b * 100)) : 0);

export interface ServiceStat {
  s: ProjectServiceDTO;
  tasks: T[];
  done: number;
  /** Deliverables handed in (sum of `qty` on done tasks). */
  delivered: number;
  /** 0-100: delivered/target when the service has a numeric target, else done/total tasks. */
  progress: number;
  proofs: number;
  late: number;
  /** Declared PICs plus anyone who has a task in this service. */
  people: string[];
}

export function serviceStats(d: ProjectReportDTO, todayStr: string): ServiceStat[] {
  return (d.services ?? []).map(s => {
    const tasks = d.tasks.filter(t => t.serviceId === s.id), done = tasks.filter(t => t.status === "done");
    const delivered = done.reduce((n, t) => n + t.qty, 0);
    return {
      s, tasks, done: done.length, delivered,
      progress: s.targetQty > 0 ? pct(delivered, s.targetQty) : pct(done.length, tasks.length),
      proofs: done.filter(t => t.hasPhoto || t.proofLink).length,
      late: tasks.filter(t => t.status !== "done" && t.date < todayStr).length,
      people: [...new Set([...s.picEmails, ...tasks.map(t => t.email)])],
    };
  });
}

export interface ProjectMetrics {
  /** Overall 0-100: the mean of the services' progress (each against its own target, capped at 100), else done/total tasks. */
  progress: number;
  /** Deliverables per unit (photos and videos are never added together). */
  lines: { unit: string; target: number; delivered: number }[];
  start: string | null; due: string | null;
  daysLeft: number | null; elapsedPct: number | null;
  health: Health; healthNote: string;
  /** One point per day from the start to today: overall progress and the straight-line plan, both in percent. */
  series: { date: string; progress: number; plan: number | null }[];
}

const mean = (l: number[]) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0);

export function projectMetrics(d: ProjectReportDTO, todayStr: string): ProjectMetrics {
  const { project: p, tasks } = d, svc = serviceStats(d, todayStr);
  const withTarget = svc.filter(x => x.s.targetQty > 0);
  const byUnit = new Map<string, { unit: string; target: number; delivered: number }>();
  for (const x of withTarget) { const l = byUnit.get(x.s.unit) ?? { unit: x.s.unit, target: 0, delivered: 0 }; l.target += x.s.targetQty; l.delivered += x.delivered; byUnit.set(x.s.unit, l); }
  const done = tasks.filter(t => t.status === "done").length;
  const progress = withTarget.length ? mean(withTarget.map(x => x.progress)) : pct(done, tasks.length);

  const first = tasks.length ? tasks.reduce((m, t) => (t.date < m ? t.date : m), tasks[0]!.date) : null;
  const start = p.startDate ?? first, due = p.dueDate;
  const total = start && due ? Math.max(1, diffDays(start, due) + 1) : null;
  const elapsed = start && total ? Math.max(0, Math.min(total, diffDays(start, todayStr) + 1)) : null;
  const elapsedPct = total && elapsed !== null ? pct(elapsed, total) : null;
  const daysLeft = due ? diffDays(todayStr, due) : null;

  let health: Health = "idle", healthNote = "Belum ada jadwal";
  if (p.closedAt) { health = "done"; healthNote = "Proyek selesai"; }
  else if (!tasks.length && !withTarget.length) { health = "idle"; healthNote = "Belum ada tugas"; }
  else if (progress >= 100) { health = "done"; healthNote = "Target tercapai"; }
  else if (daysLeft !== null && daysLeft < 0) { health = "late"; healthNote = `Lewat tenggat ${-daysLeft} hari`; }
  else if (elapsedPct !== null && progress + 15 < elapsedPct) { health = "risk"; healthNote = `Progres ${progress}% di bawah rencana ${elapsedPct}%`; }
  else { health = "ok"; healthNote = elapsedPct !== null ? `Sesuai rencana (${progress}% dari ${elapsedPct}%)` : "Berjalan"; }

  const series: ProjectMetrics["series"] = [];
  if (start) {
    const end = due && due < todayStr ? due : todayStr;
    const doneBy = (day: string, f: (t: T) => boolean) => tasks.filter(t => t.status === "done" && t.doneAt && dayOf(t.doneAt) <= day && f(t));
    for (let day = start, i = 0; day <= end && i < 400; day = addDays(day, 1), i++) {
      const per = svc.length
        ? svc.map(x => x.s.targetQty > 0 ? pct(doneBy(day, t => t.serviceId === x.s.id).reduce((n, t) => n + t.qty, 0), x.s.targetQty) : pct(doneBy(day, t => t.serviceId === x.s.id).length, x.tasks.length))
        : [pct(doneBy(day, () => true).length, tasks.length)];
      series.push({ date: day, progress: mean(per), plan: total ? pct(diffDays(start, day) + 1, total) : null });
    }
  }
  return { progress, lines: [...byUnit.values()], start, due, daysLeft, elapsedPct, health, healthNote, series };
}

export const HEALTH_LABEL: Record<Health, string> = { ok: "Sesuai rencana", risk: "Berisiko", late: "Terlambat", done: "Selesai", idle: "Belum mulai" };

export interface DayGroup { date: string; tasks: T[]; doneCount: number; qty: number }
/** Tasks grouped by the day they were scheduled for, newest first, up to today (plus any later day that already has work). */
export function dayGroups(tasks: T[]): DayGroup[] {
  const m = new Map<string, T[]>();
  for (const t of tasks) m.set(t.date, [...(m.get(t.date) ?? []), t]);
  return [...m].sort((a, b) => b[0].localeCompare(a[0])).map(([date, l]) => {
    const done = l.filter(t => t.status === "done");
    return { date, tasks: l, doneCount: done.length, qty: done.reduce((n, t) => n + t.qty, 0) };
  });
}

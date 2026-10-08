// Background work: create today's routine tasks and send deadline / morning reminders.
import { and, eq } from "drizzle-orm";
import { atMs, weekday, wib } from "@shared/time";
import type { Db } from "./db/index.js";
import { meta, members, pushSubs, routines, tasks } from "./db/schema.js";
import type { Bus } from "./events.js";
import type { Push } from "./push.js";

/** Idempotent: a routine's task for a date has the fixed id r-<routine>-<date>. Returns how many were created. */
export function ensureRoutines(db: Db, date: string, now = Date.now()) {
  const dow = weekday(date);
  let n = 0;
  for (const r of db.select().from(routines).all()) {
    if (!r.days.includes(dow)) continue;
    const res = db.insert(tasks).values({
      id: `r-${r.id}-${date}`, email: r.email, date, title: r.title, note: r.note, start: r.start, due: r.due, hot: r.hot,
      needProof: r.needProof, by: "owner", fromAdmin: r.byName, routineId: r.id, createdAt: now,
    }).onConflictDoNothing().run();
    n += res.changes;
  }
  return n;
}

/** Deadline reminders every run; the morning summary once, at 08:00-08:14 WIB. */
export async function runReminders(db: Db, push: Push, now = Date.now()) {
  const { date, hour, minute } = wib(now);
  const today = db.select().from(tasks).where(eq(tasks.date, date)).all();

  for (const t of today) {
    if (t.status === "done" || !t.due) continue;
    const dl = atMs(date, t.due);
    if (now > dl && !t.remLate) {
      db.update(tasks).set({ remLate: true }).where(eq(tasks.id, t.id)).run();
      await push.send([t.email], "Tugas terlambat", `${t.title} (tenggat ${t.due})`, "late-" + t.id);
    } else if (dl > now && dl - now <= 30 * 60000 && !t.remDue && !t.remLate) {
      db.update(tasks).set({ remDue: true }).where(eq(tasks.id, t.id)).run();
      await push.send([t.email], "Tenggat sebentar lagi", `${t.title} jam ${t.due}`, "due-" + t.id);
    }
  }

  const done = db.select().from(meta).where(eq(meta.k, "morning")).get();
  if (hour !== 8 || minute >= 15 || done?.v === date) return;
  db.insert(meta).values({ k: "morning", v: date }).onConflictDoUpdate({ target: meta.k, set: { v: date } }).run();
  const subscribed = new Set(db.select({ email: pushSubs.email }).from(pushSubs).all().map(x => x.email));
  for (const m of db.select({ email: members.email, isAdmin: members.isAdmin }).from(members).all()) {
    if (m.isAdmin || !subscribed.has(m.email)) continue;
    const open = today.filter(t => t.email === m.email && t.status !== "done").length;
    if (open) await push.send([m.email], "Selamat pagi", `Kamu punya ${open} tugas hari ini.`, "morning-" + date);
  }
}

/** Every 15 minutes (on the clock); also once at startup so a restart never skips today's routines. */
export function startJobs(db: Db, push: Push, bus: Bus) {
  const tick = () => {
    try {
      if (ensureRoutines(db, wib().date)) bus.emit("tasks");
      runReminders(db, push).catch(e => console.error("reminders", e));
    } catch (e) { console.error("jobs", e); }
  };
  tick();
  let last = "";
  return setInterval(() => {
    const { date, hour, minute } = wib();
    const key = `${date}T${hour}:${minute}`;
    if (minute % 15 === 0 && key !== last) { last = key; tick(); }
  }, 30_000).unref();
}

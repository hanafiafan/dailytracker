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


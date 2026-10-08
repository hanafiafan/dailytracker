import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, inArray } from "drizzle-orm";
import { commentCreate, taskCreate, taskReport, taskStatus } from "@shared/schemas";
import { addDays, weekday, wib } from "@shared/time";
import { comments, members, proofs, routines, tasks } from "../db/schema.js";
import { toComment, toTask } from "../dto.js";
import { loadTeam, newId, type AppEnv, type Deps } from "../context.js";
import type { Notify } from "../notify.js";

const MAX_PROOF = 1_500_000;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const taskRoutes = ({ db, bus }: Deps, notify: Notify) => {
  const find = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get();
  const touch = () => bus.emit("tasks");

  return new Hono<AppEnv>()
    // Tasks from `from` onward that the caller may see.
    .get("/", c => {
      const u = c.var.user, from = c.req.query("from") ?? addDays(wib().date, -30);
      const team = loadTeam(db);
      const visible = u.policy.isBoss ? null : team.map(m => m.email).filter(e => u.policy.canSee(e));
      if (visible && !visible.length) return c.json([]);
      const rows = db.select().from(tasks)
        .where(visible ? and(gte(tasks.date, from), inArray(tasks.email, visible)) : gte(tasks.date, from)).all();
      const cs = rows.length ? db.select().from(comments).where(inArray(comments.taskId, rows.map(r => r.id))).all() : [];
      const byTask = Map.groupBy(cs, x => x.taskId);
      return c.json(rows.map(r => toTask(r, (byTask.get(r.id) ?? []).sort((a, b) => a.at - b.at))));
    })
    .post("/", zValidator("json", taskCreate), c => {
      const u = c.var.user, b = c.req.valid("json"), now = Date.now(), today = wib().date;
      const team = loadTeam(db);
      const emails = [...new Set(b.emails)];
      for (const e of emails) if (!team.some(m => m.email === e)) return c.json({ error: "Anggota tidak ditemukan" }, 404);

      if (!u.policy.isManager) {
        // A member may only add a plain task for themself.
        if (!u.member || emails.length !== 1 || emails[0] !== u.email || b.routineDays) return c.json({ error: "forbidden" }, 403);
        const id = newId();
        db.insert(tasks).values({ id, email: u.email, date: b.date ?? today, title: b.title, note: "", start: b.start ?? null, due: b.due ?? null, needProof: false, by: "self", createdAt: now }).run();
        touch();
        return c.json({ ids: [id] }, 201);
      }
      if (emails.some(e => !u.policy.canManage(e))) return c.json({ error: "forbidden" }, 403);

      const made: (typeof tasks.$inferSelect)[] = [];
      db.transaction(tx => {
        for (const email of emails) {
          const base = { email, title: b.title, note: b.note, start: b.start ?? null, due: b.due ?? null, hot: b.hot, needProof: b.needProof, by: "owner" as const, fromAdmin: u.member?.name ?? u.name, createdAt: now };
          if (b.routineDays?.length) {
            const rid = newId(4);
            tx.insert(routines).values({ id: rid, email, title: b.title, note: b.note, start: base.start, due: base.due, days: [...new Set(b.routineDays)].sort(), hot: b.hot, needProof: b.needProof, byName: base.fromAdmin }).run();
            if (b.routineDays.includes(weekday(today))) {
              const row = { ...base, id: `r-${rid}-${today}`, date: today, routineId: rid } as typeof tasks.$inferInsert;
              tx.insert(tasks).values(row).run();
            }
          } else {
            const row = { ...base, id: newId(), date: b.date ?? today } as typeof tasks.$inferInsert;
            tx.insert(tasks).values(row).run();
            made.push(tx.select().from(tasks).where(eq(tasks.id, row.id!)).get()!);
          }
          tx.update(members).set({ askAt: null }).where(eq(members.email, email)).run();
        }
      });
      made.forEach(t => void notify.newTask(t));
      touch(); bus.emit("team");
      return c.json({ ids: made.map(t => t.id) }, 201);
    })

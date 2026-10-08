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

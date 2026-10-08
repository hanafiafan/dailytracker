import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { routines } from "../db/schema.js";
import { toRoutine } from "../dto.js";
import { loadTeam, type AppEnv, type Deps } from "../context.js";

// Routines are created through POST /tasks (with routineDays); this lists and stops them.
export const routineRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .get("/", c => {
    const u = c.var.user, visible = new Set(loadTeam(db).map(m => m.email).filter(e => u.policy.canSee(e)));
    return c.json(db.select().from(routines).all().filter(r => visible.has(r.email)).map(toRoutine));
  })
  .delete("/:id", c => {
    const r = db.select().from(routines).where(eq(routines.id, c.req.param("id"))).get();
    if (!r) return c.json({ ok: true });
    if (!c.var.user.policy.canManage(r.email)) return c.json({ error: "forbidden" }, 403);
    db.delete(routines).where(eq(routines.id, r.id)).run();
    bus.emit("tasks");
    return c.json({ ok: true });
  });

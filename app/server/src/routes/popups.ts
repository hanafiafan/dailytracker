import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, isNull, notInArray, or } from "drizzle-orm";
import { popupInput } from "@shared/schemas";
import { popupSeen, popups } from "../db/schema.js";
import { newId, type AppEnv, type Deps } from "../context.js";

type Row = typeof popups.$inferSelect;
type Input = typeof popupInput._output;

/** When a popup stops being shown. The clock of a preset duration (re)starts when the popup is published or switched back on, or when the preset changes; plain edits keep it. */
export function endsAtFor(prev: Row | undefined, b: Input, now: number): { endsAt: number | null } | { error: string } {
  if (b.draft || !b.active) return { endsAt: b.durationMin ? null : b.endsAt };
  if (b.durationMin) {
    const restart = !prev || prev.draft || !prev.active || prev.durationMin !== b.durationMin;
    return { endsAt: restart ? now + b.durationMin * 60_000 : prev.endsAt };
  }
  if (b.endsAt !== null && b.endsAt <= now) return { error: "Waktu berakhir sudah lewat. Pilih waktu di masa depan." };
  return { endsAt: b.endsAt };
}

// Info popups: the superadmin writes them, everyone else sees each one once and dismisses it.
export const popupRoutes = ({ db, bus }: Deps) => {
  const superOnly = createMiddleware<AppEnv>(async (c, next) => !c.var.user.policy.isSuper ? c.json({ error: "Akses khusus Superadmin" }, 403) : next());
  const row = (id: string) => db.select().from(popups).where(eq(popups.id, id)).get();
  return new Hono<AppEnv>()
    // Published, switched on, not expired, and not dismissed yet by this person; oldest first.
    .get("/active", c => {
      const seen = db.select({ id: popupSeen.popupId }).from(popupSeen).where(eq(popupSeen.email, c.var.user.email));
      return c.json(db.select().from(popups)
        .where(and(eq(popups.active, true), eq(popups.draft, false), or(isNull(popups.endsAt), gt(popups.endsAt, Date.now())), notInArray(popups.id, seen)))
        .orderBy(asc(popups.createdAt)).all());
    })
    .post("/:id/seen", c => {
      if (!row(c.req.param("id"))) return c.json({ error: "not found" }, 404);
      db.insert(popupSeen).values({ popupId: c.req.param("id"), email: c.var.user.email }).onConflictDoNothing().run();
      return c.json({ ok: true });
    })
    .get("/", superOnly, c => c.json(db.select().from(popups).orderBy(desc(popups.createdAt)).all()))
    .post("/", superOnly, zValidator("json", popupInput), c => {
      const b = c.req.valid("json"), at = endsAtFor(undefined, b, Date.now());
      if ("error" in at) return c.json({ error: at.error }, 400);
      const r = { id: newId(), ...b, endsAt: at.endsAt, createdAt: Date.now() };
      db.insert(popups).values(r).run();
      bus.emit("popups");
      return c.json(r, 201);
    })
    .put("/:id", superOnly, zValidator("json", popupInput), c => {
      const prev = row(c.req.param("id"));
      if (!prev) return c.json({ error: "not found" }, 404);
      const b = c.req.valid("json"), at = endsAtFor(prev, b, Date.now());
      if ("error" in at) return c.json({ error: at.error }, 400);
      db.update(popups).set({ ...b, endsAt: at.endsAt }).where(eq(popups.id, prev.id)).run();
      bus.emit("popups");
      return c.json({ ok: true });
    })
    .delete("/:id", superOnly, c => {
      db.delete(popups).where(eq(popups.id, c.req.param("id"))).run();
      bus.emit("popups");
      return c.json({ ok: true });
    });
};

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { popupInput } from "@shared/schemas";
import { popupSeen, popups } from "../db/schema.js";
import { newId, type AppEnv, type Deps } from "../context.js";

// Info popups: the superadmin writes them, everyone else sees each one once and dismisses it.
export const popupRoutes = ({ db, bus }: Deps) => {
  const superOnly = createMiddleware<AppEnv>(async (c, next) => !c.var.user.policy.isSuper ? c.json({ error: "Akses khusus Superadmin" }, 403) : next());
  const row = (id: string) => db.select().from(popups).where(eq(popups.id, id)).get();
  return new Hono<AppEnv>()
    // Active popups this person has not dismissed yet, oldest first.
    .get("/active", c => {
      const seen = db.select({ id: popupSeen.popupId }).from(popupSeen).where(eq(popupSeen.email, c.var.user.email));
      return c.json(db.select().from(popups).where(and(eq(popups.active, true), notInArray(popups.id, seen))).orderBy(asc(popups.createdAt)).all());
    })
    .post("/:id/seen", c => {
      if (!row(c.req.param("id"))) return c.json({ error: "not found" }, 404);
      db.insert(popupSeen).values({ popupId: c.req.param("id"), email: c.var.user.email }).onConflictDoNothing().run();
      return c.json({ ok: true });
    })
    .get("/", superOnly, c => c.json(db.select().from(popups).orderBy(desc(popups.createdAt)).all()))
    .post("/", superOnly, zValidator("json", popupInput), c => {
      const r = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
      db.insert(popups).values(r).run();
      bus.emit("popups");
      return c.json(r, 201);
    })
    .put("/:id", superOnly, zValidator("json", popupInput), c => {
      if (!row(c.req.param("id"))) return c.json({ error: "not found" }, 404);
      db.update(popups).set(c.req.valid("json")).where(eq(popups.id, c.req.param("id"))).run();
      bus.emit("popups");
      return c.json({ ok: true });
    })
    .delete("/:id", superOnly, c => {
      db.delete(popups).where(eq(popups.id, c.req.param("id"))).run();
      bus.emit("popups");
      return c.json({ ok: true });
    });
};

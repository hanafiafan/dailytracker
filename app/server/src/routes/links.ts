import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { linkCreate } from "@shared/schemas";
import { links } from "../db/schema.js";
import { newId, type AppEnv, type Deps } from "../context.js";

// Shared shortcuts (spreadsheets, trackers) for the owner and admins.
export const linkRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .use(async (c, next) => c.var.user.policy.isManager ? next() : c.json({ error: "forbidden" }, 403))
  .get("/", c => c.json(db.select().from(links).orderBy(desc(links.createdAt)).all()))
  .post("/", zValidator("json", linkCreate), c => {
    const row = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
    db.insert(links).values(row).run();
    bus.emit("links");
    return c.json(row, 201);
  })
  .delete("/:id", c => {
    db.delete(links).where(eq(links.id, c.req.param("id"))).run();
    bus.emit("links");
    return c.json({ ok: true });
  });

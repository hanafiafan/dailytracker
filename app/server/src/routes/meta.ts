import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import { labelInput, projectInput } from "@shared/schemas";
import { labels, projects, sessions } from "../db/schema.js";
import { toLabel, toProject } from "../dto.js";
import { newId, type AppEnv, type Deps } from "../context.js";

// Projects (campaigns) and labels: everyone can read, the owner and admins manage them.
export const metaRoutes = ({ db, bus, env }: Deps) => {
  const guard = new Hono<AppEnv>().use(async (c, next) => c.var.user.policy.isManager ? next() : c.json({ error: "forbidden" }, 403));
  return new Hono<AppEnv>()
    .get("/", c => c.json({
      owner: { email: env.OWNER_EMAIL, name: db.select({ n: sessions.name }).from(sessions).where(eq(sessions.email, env.OWNER_EMAIL)).orderBy(desc(sessions.exp)).get()?.n ?? "Pemilik" },
      projects: db.select().from(projects).orderBy(asc(projects.createdAt)).all().map(toProject),
      labels: db.select().from(labels).orderBy(asc(labels.name)).all().map(toLabel),
    }))
    .route("/", guard
      .post("/projects", zValidator("json", projectInput), c => {
        const row = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
        db.insert(projects).values(row).run();
        bus.emit("meta");
        return c.json(toProject(row), 201);
      })
      .patch("/projects/:id", zValidator("json", projectInput.partial()), c => {
        db.update(projects).set(c.req.valid("json")).where(eq(projects.id, c.req.param("id"))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/projects/:id", c => {
        if (!c.var.user.policy.isBoss) return c.json({ error: "forbidden" }, 403);
        db.delete(projects).where(eq(projects.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("tasks");
        return c.json({ ok: true });
      })
      .post("/labels", zValidator("json", labelInput), c => {
        const row = { id: newId(), ...c.req.valid("json") };
        db.insert(labels).values(row).run();
        bus.emit("meta");
        return c.json(toLabel(row), 201);
      })
      .patch("/labels/:id", zValidator("json", labelInput.partial()), c => {
        db.update(labels).set(c.req.valid("json")).where(eq(labels.id, c.req.param("id"))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/labels/:id", c => {
        db.delete(labels).where(eq(labels.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("tasks");
        return c.json({ ok: true });
      }));
};

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { ProjectStatDTO } from "@shared/schemas";
import { entityInput, entityPatch, labelInput, projectClose, projectInput, projectPatch, projectServiceInput, projectServicePatch } from "@shared/schemas";
import { entities, labels, projectServices, projects, sessions, tasks } from "../db/schema.js";
import { toLabel, toProject } from "../dto.js";
import { logActivity } from "../services.js";
import { newId, type AppEnv, type Deps } from "../context.js";

// Projects, labels, entities, and services
export const metaRoutes = ({ db, bus, env }: Deps) => {
  const projectStats = () => {
    const out: Record<string, ProjectStatDTO> = {}, get = (id: string) => (out[id] ??= { total: 0, done: 0, services: [] });
    const svc = new Map<string, ProjectStatDTO["services"][number]>();
    for (const s of db.select().from(projectServices).orderBy(asc(projectServices.createdAt)).all()) { const row = { target: s.targetQty, delivered: 0, unit: s.unit, tasks: 0, tasksDone: 0 }; svc.set(s.id, row); get(s.projectId).services.push(row); }
    for (const t of db.select({ p: tasks.projectId, s: tasks.status, q: tasks.qty, sv: tasks.serviceId }).from(tasks).where(isNotNull(tasks.projectId)).all()) {
      const o = get(t.p!), r = t.sv ? svc.get(t.sv) : undefined;
      o.total++; if (r) r.tasks++;
      if (t.s === "done") { o.done++; if (r) { r.tasksDone++; r.delivered += t.q; } }
    }
    return out;
  };
  const guard = new Hono<AppEnv>().use(async (c, next) => (c.var.user.policy.isManager || c.var.user.policy.canCreateProject()) ? next() : c.json({ error: "forbidden" }, 403));
  return new Hono<AppEnv>()
    .get("/", c => c.json({
      owner: { email: env.OWNER_EMAIL, name: db.select({ n: sessions.name }).from(sessions).where(eq(sessions.email, env.OWNER_EMAIL)).orderBy(desc(sessions.exp)).get()?.n ?? "Hellens" },
      // A client only learns about their own projects.
      projects: db.select().from(projects).orderBy(asc(projects.createdAt)).all().filter(p => !c.var.user.policy.isClient || p.clientEmail === c.var.user.email).map(toProject),
      projectStats: projectStats(),
      labels: db.select().from(labels).orderBy(asc(labels.name)).all().map(toLabel),
      entities: db.select().from(entities).orderBy(asc(entities.name)).all(),
    }))
    .get("/projects/:id/services", c => {
      const u = c.var.user, p = db.select({ clientEmail: projects.clientEmail }).from(projects).where(eq(projects.id, c.req.param("id"))).get();
      if (u.policy.isClient && (!p || p.clientEmail !== u.email)) return c.json({ error: "not found" }, 404);
      const rows = db.select().from(projectServices).where(eq(projectServices.projectId, c.req.param("id"))).orderBy(asc(projectServices.createdAt)).all();
      return c.json(rows);
    })
    .post("/projects", zValidator("json", projectInput), c => {
      if (!c.var.user.policy.canCreateProject()) return c.json({ error: "Anda belum memiliki izin untuk membuat proyek baru" }, 403);
      const row = { id: newId(), ...c.req.valid("json"), createdAt: Date.now() };
      db.insert(projects).values(row).run();
      bus.emit("meta");
      return c.json(toProject({ clientEmail: null, pmEmail: null, startDate: null, dueDate: null, ...row, closedAt: null, closedBy: null, summary: "", resultLinks: [] }), 201);
    })
    .route("/", guard
      .patch("/projects/:id", zValidator("json", projectPatch), c => {
        db.update(projects).set(c.req.valid("json")).where(eq(projects.id, c.req.param("id"))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .post("/projects/:id/services", zValidator("json", projectServiceInput), c => {
        const pid = c.req.param("id");
        const p = db.select().from(projects).where(eq(projects.id, pid)).get();
        if (!p) return c.json({ error: "Proyek tidak ditemukan" }, 404);
        const row = { id: newId(), projectId: pid, ...c.req.valid("json"), createdAt: Date.now() };
        db.insert(projectServices).values(row).run();
        bus.emit("meta");
        return c.json(row, 201);
      })
      .patch("/projects/:id/services/:sid", zValidator("json", projectServicePatch), c => {
        db.update(projectServices).set(c.req.valid("json")).where(and(eq(projectServices.id, c.req.param("sid")), eq(projectServices.projectId, c.req.param("id")))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/projects/:id/services/:sid", c => {
        db.delete(projectServices).where(and(eq(projectServices.id, c.req.param("sid")), eq(projectServices.projectId, c.req.param("id")))).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      // Closing report: a summary and result links. Open tasks need an explicit `force`, so nobody closes a project by accident.
      .post("/projects/:id/close", zValidator("json", projectClose), c => {
        const u = c.var.user, p = db.select().from(projects).where(eq(projects.id, c.req.param("id"))).get(), b = c.req.valid("json");
        if (!p) return c.json({ error: "not found" }, 404);
        if (p.closedAt) return c.json({ error: "Proyek ini sudah ditutup." }, 409);
        const open = db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, p.id), ne(tasks.status, "done"))).all().length;
        if (open && !b.force) return c.json({ error: `Masih ada ${open} tugas yang belum selesai.`, open }, 409);
        db.update(projects).set({ closedAt: Date.now(), closedBy: u.email, summary: b.summary, resultLinks: b.links }).where(eq(projects.id, p.id)).run();
        logActivity(db, u, null, "project", `menutup proyek ${p.name}`);
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .post("/projects/:id/reopen", c => {
        const p = db.select().from(projects).where(eq(projects.id, c.req.param("id"))).get();
        if (!p) return c.json({ error: "not found" }, 404);
        db.update(projects).set({ closedAt: null, closedBy: null }).where(eq(projects.id, p.id)).run();
        bus.emit("meta");
        return c.json({ ok: true });
      })
      .delete("/projects/:id", c => {
        if (!c.var.user.policy.isBoss && !c.var.user.policy.isBO) return c.json({ error: "forbidden" }, 403);
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
        if (!c.var.user.policy.isBoss && !c.var.user.policy.isBO) return c.json({ error: "forbidden" }, 403);
        db.delete(labels).where(eq(labels.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("tasks");
        return c.json({ ok: true });
      })
      // Entities CRUD (Superadmin / isSuper only)
      .post("/entities", zValidator("json", entityInput), c => {
        if (!c.var.user.policy.isSuper) return c.json({ error: "forbidden" }, 403);
        const b = c.req.valid("json");
        const existing = db.select().from(entities).where(eq(entities.id, b.id)).get();
        if (existing) return c.json({ error: "Kode entitas sudah ada" }, 409);
        const row = { ...b, createdAt: Date.now() };
        db.insert(entities).values(row).run();
        bus.emit("meta"); bus.emit("team");
        return c.json(row, 201);
      })
      .patch("/entities/:id", zValidator("json", entityPatch), c => {
        if (!c.var.user.policy.isSuper) return c.json({ error: "forbidden" }, 403);
        db.update(entities).set(c.req.valid("json")).where(eq(entities.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("team");
        return c.json({ ok: true });
      })
      .delete("/entities/:id", c => {
        if (!c.var.user.policy.isSuper) return c.json({ error: "forbidden" }, 403);
        db.delete(entities).where(eq(entities.id, c.req.param("id"))).run();
        bus.emit("meta"); bus.emit("team");
        return c.json({ ok: true });
      }));
};

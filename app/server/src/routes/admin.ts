import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, sql } from "drizzle-orm";
import { activity, chatGroups, entities, members, messages, projects, tasks } from "../db/schema.js";
import { unitsOf } from "@shared/policy";
import { backupSettings, resetInput, resetRun } from "@shared/schemas";
import { backupNow, deleteBackup, restoreBackup, saveUpload, getBackupSettings, listBackups, setBackupSettings } from "../backup.js";
import { applyReset, planReset } from "../reset.js";
import { toActivity } from "../dto.js";
import { loadTeam, type AppEnv, type Deps } from "../context.js";

export const adminRoutes = ({ db, bus, env, restart }: Deps) => {
  const dir = join(env.DATA_DIR, "backups");
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      const u = c.var.user;
      if (!u.owner && !u.policy.isSuper) return c.json({ error: "Akses khusus Superadmin" }, 403);
      return next();
    })
    .get("/overview", c => {
      const allTeam = loadTeam(db);
      const allProjects = db.select().from(projects).all();
      const allTasks = db.select({
        id: tasks.id,
        status: tasks.status,
        approvalStatus: tasks.approvalStatus,
        date: tasks.date,
        due: tasks.due,
        projectId: tasks.projectId,
      }).from(tasks).all();
      const allEntities = db.select().from(entities).all();
      const totalMessages = db.select({ count: sql<number>`count(*)` }).from(messages).get()?.count ?? 0;

      // Tasks stats
      const doneTasks = allTasks.filter(t => t.status === "done").length;
      const doingTasks = allTasks.filter(t => t.status === "doing").length;
      const todoTasks = allTasks.filter(t => t.status === "todo").length;
      const pendingApprovalTasks = allTasks.filter(t => t.approvalStatus === "pending").length;

      // Projects stats
      const activeProjects = allProjects.filter(p => !p.closedAt && !p.archived).length;
      const closedProjects = allProjects.filter(p => !!p.closedAt || !!p.archived).length;

      // Members stats
      const clients = allTeam.filter(m => m.accountType === "client").length;
      const employees = allTeam.length - clients;
      const admins = allTeam.filter(m => m.isAdmin).length;
      const canCreateProjects = allTeam.filter(m => m.canCreateProject).length;

      // Group / entity breakdown
      const entityCounts: Record<string, number> = {};
      allTeam.forEach(m => {
        for (const key of unitsOf(m).length ? unitsOf(m) : ["Tanpa Unit"]) entityCounts[key] = (entityCounts[key] || 0) + 1;
      });

      return c.json({
        owner: env.OWNER_EMAIL,
        counts: {
          totalMembers: allTeam.length,
          employees,
          clients,
          admins,
          canCreateProjects,
          totalProjects: allProjects.length,
          activeProjects,
          closedProjects,
          totalTasks: allTasks.length,
          doneTasks,
          doingTasks,
          todoTasks,
          pendingApprovalTasks,
          totalEntities: allEntities.length,
          totalMessages,
        },
        entityCounts,
      });
    })
    .get("/audit", c => {
      const limit = Math.min(Number(c.req.query("limit")) || 60, 200);
      const rows = db.select({ a: activity, title: tasks.title }).from(activity)
        .leftJoin(tasks, eq(activity.taskId, tasks.id))
        .orderBy(desc(activity.at))
        .limit(limit)
        .all();
      return c.json(rows.map(r => toActivity(r.a, r.title)));
    })
    // Backups: sessions (times of day) are custom; scheduled copies are pruned, manual and pre-reset copies stay until deleted here.
    .get("/backups", c => c.json({ settings: getBackupSettings(db), files: listBackups(dir) }))
    .put("/backups/settings", zValidator("json", backupSettings), c => { setBackupSettings(db, c.req.valid("json")); return c.json(getBackupSettings(db)); })
    .post("/backups", zValidator("json", z.object({ label: z.string().trim().max(40).default("") })), async c => c.json({ file: (await backupNow(db, dir, "manual", c.req.valid("json").label)).split("/").pop() }))
    .get("/backups/:file/download", c => {
      const f = c.req.param("file");
      if (!listBackups(dir).some(b => b.file === f)) return c.json({ error: "not found" }, 404);
      return new Response(Readable.toWeb(createReadStream(join(dir, f))) as ReadableStream, { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${f}"`, "cache-control": "no-store" } });
    })
    .post("/backups/upload", async c => {
      const f = (await c.req.parseBody()).file;
      if (!(f instanceof File) || !f.size) return c.json({ error: "Pilih berkas backup (.db)" }, 400);
      const file = saveUpload(dir, new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.db$/i, ""));
      return file ? c.json({ file: file.split("/").pop() }) : c.json({ error: "Berkas bukan backup database yang valid" }, 400);
    })
    // Swaps in a stored copy, then restarts the process so the app reopens (and migrates) the restored database.
    .post("/backups/:file/restore", zValidator("json", z.object({ confirm: z.literal("PULIHKAN") })), async c => {
      if (!restart) return c.json({ error: "Pemulihan tidak tersedia di mode ini" }, 501);
      const before = await restoreBackup(db, dir, join(env.DATA_DIR, "app.db"), c.req.param("file"));
      if (!before) return c.json({ error: "Backup tidak ditemukan atau rusak" }, 404);
      restart();
      return c.json({ backup: before.split("/").pop() });
    })
    .delete("/backups/:file", c => deleteBackup(dir, c.req.param("file")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404))
    // Reset: wipes the working data (tasks, projects, ...) but keeps the team; a pre-reset copy is always written first and never pruned.
    .post("/reset/plan", zValidator("json", resetInput), c => c.json(planReset(db, c.req.valid("json"))))
    .post("/reset", zValidator("json", resetRun), async c => {
      const { confirm: _c, ...o } = c.req.valid("json");
      const file = (await backupNow(db, dir, "pre-reset")).split("/").pop();
      applyReset(db, o);
      for (const t of ["tasks", "team", "meta", "inbox", "leaves", "chat", "popups"] as const) bus.emit(t);
      return c.json({ backup: file });
    });
};

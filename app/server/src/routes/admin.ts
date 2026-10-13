import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { activity, chatGroups, entities, members, messages, projects, tasks } from "../db/schema.js";
import { toActivity } from "../dto.js";
import { loadTeam, type AppEnv, type Deps } from "../context.js";

export const adminRoutes = ({ db, bus, env }: Deps) => {
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
        const key = m.group || "Tanpa Unit";
        entityCounts[key] = (entityCounts[key] || 0) + 1;
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
    });
};

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { memberCreate, memberMove, memberOrder, memberPatch } from "@shared/schemas";
import { members } from "../db/schema.js";
import { toMemberLite } from "../dto.js";
import { loadTeam, memberColumns, type AppEnv, type Deps } from "../context.js";

const MAX_PHOTO = 150_000;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const teamRoutes = ({ db, bus }: Deps) => new Hono<AppEnv>()
  .get("/", c => {
    const u = c.var.user;
    if (!u.owner && !u.member) return c.json({ error: "forbidden" }, 403);
    const rows = db.select(memberColumns).from(members).orderBy(asc(members.sortOrder), asc(members.name)).all();
    return c.json(rows.map(toMemberLite));
  })
  .post("/", zValidator("json", memberCreate), c => {
    const u = c.var.user, b = c.req.valid("json");
    if (!u.policy.canCreateMember(b.group, false)) return c.json({ error: "forbidden" }, 403);
    if (db.select().from(members).where(eq(members.email, b.email)).get()) return c.json({ error: "Email itu sudah dipakai anggota lain" }, 409);
    const order = Math.max(0, ...loadTeam(db).map(m => m.sortOrder)) + 1;
    db.insert(members).values({ email: b.email, name: b.name, role: b.role, group: b.group, sortOrder: order }).run();
    bus.emit("team");
    return c.json({ ok: true }, 201);
  })
  .put("/order", zValidator("json", memberOrder), c => {
    const u = c.var.user, { emails } = c.req.valid("json");
    db.transaction(tx => {
      emails.forEach((email, i) => { if (u.policy.canManage(email) || u.email === email) tx.update(members).set({ sortOrder: i + 1 }).where(eq(members.email, email)).run(); });
    });
    bus.emit("team");
    return c.json({ ok: true });
  })
  .patch("/:email", zValidator("json", memberPatch), c => {
    const u = c.var.user, email = c.req.param("email"), b = c.req.valid("json");
    const target = loadTeam(db).find(m => m.email === email);
    if (!target) return c.json({ error: "not found" }, 404);
    const self = u.email === email;
    const selfFields = Object.keys(b).every(k => k === "name" || k === "role");
    if (!(self && selfFields) && !u.policy.canEditMember(email, b)) return c.json({ error: "forbidden" }, 403);
    if (self && (b.isAdmin !== undefined || b.adminGroups !== undefined) && !u.policy.isBoss) return c.json({ error: "forbidden" }, 403);
    const patch: Partial<typeof members.$inferInsert> = { ...b };
    if (b.isAdmin === false) patch.adminGroups = [];
    if (b.isAdmin === true && b.adminGroups === undefined) patch.adminGroups = target.group ? [target.group] : []; // a new admin starts limited to their own unit
    if (Object.keys(patch).length) db.update(members).set(patch).where(eq(members.email, email)).run();
    bus.emit("team");
    return c.json({ ok: true });
  })
  // Change someone's email: tasks and routines follow through ON UPDATE CASCADE.
  .post("/:email/move", zValidator("json", memberMove), c => {
    const u = c.var.user, email = c.req.param("email"), { email: to } = c.req.valid("json");
    if (u.email === email || !u.policy.canManage(email)) return c.json({ error: "forbidden" }, 403);
    if (!loadTeam(db).some(m => m.email === email)) return c.json({ error: "not found" }, 404);
    if (db.select().from(members).where(eq(members.email, to)).get()) return c.json({ error: "Email itu sudah dipakai anggota lain" }, 409);
    db.update(members).set({ email: to, seenAt: null }).where(eq(members.email, email)).run();
    bus.emit("team"); bus.emit("tasks");
    return c.json({ ok: true });
  })
  .delete("/:email", c => {
    const u = c.var.user, email = c.req.param("email");
    if (u.email === email || !u.policy.canManage(email)) return c.json({ error: "forbidden" }, 403);
    db.delete(members).where(eq(members.email, email)).run();
    bus.emit("team"); bus.emit("tasks");
    return c.json({ ok: true });
  })

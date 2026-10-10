import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { memberCreate, memberMove, memberOrder, memberPatch } from "@shared/schemas";
import { chatGroups, members } from "../db/schema.js";
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
    if (!u.policy.canCreateMember()) return c.json({ error: "forbidden" }, 403);
    if (db.select().from(members).where(eq(members.email, b.email)).get()) return c.json({ error: "Email itu sudah dipakai anggota lain" }, 409);
    const order = Math.max(0, ...loadTeam(db).map(m => m.sortOrder)) + 1;
    db.insert(members).values({ email: b.email, name: b.name, role: b.role, group: b.group, sortOrder: order }).run();
    bus.emit("team");
    return c.json({ ok: true }, 201);
  })
  .put("/order", zValidator("json", memberOrder), c => {
    const u = c.var.user, { emails } = c.req.valid("json");
    if (!u.policy.isSuper) return c.json({ error: "forbidden" }, 403);
    db.transaction(tx => {
      emails.forEach((email, i) => { tx.update(members).set({ sortOrder: i + 1 }).where(eq(members.email, email)).run(); });
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
    if (self && (b.isAdmin !== undefined || b.adminGroups !== undefined) && !u.policy.isSuper) return c.json({ error: "forbidden" }, 403);
    if (b.managerEmail) {
      // the manager must be on the team and must not already report (directly or not) to this person
      const all = loadTeam(db), seen = new Set<string>([email]);
      if (!all.some(m => m.email === b.managerEmail)) return c.json({ error: "Atasan tidak ditemukan" }, 404);
      for (let cur: string | null | undefined = b.managerEmail; cur; cur = all.find(m => m.email === cur)?.managerEmail) {
        if (seen.has(cur)) return c.json({ error: "Atasan itu sendiri melapor ke orang ini (lingkaran)." }, 400);
        seen.add(cur);
      }
    }
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
    if (u.email === email || !u.policy.isSuper) return c.json({ error: "forbidden" }, 403);
    if (!loadTeam(db).some(m => m.email === email)) return c.json({ error: "not found" }, 404);
    if (db.select().from(members).where(eq(members.email, to)).get()) return c.json({ error: "Email itu sudah dipakai anggota lain" }, 409);
    db.update(members).set({ email: to, seenAt: null }).where(eq(members.email, email)).run();
    db.update(chatGroups).set({ createdBy: to }).where(eq(chatGroups.createdBy, email)).run(); // group ownership follows the new email
    bus.emit("team"); bus.emit("tasks");
    return c.json({ ok: true });
  })
  .delete("/:email", c => {
    const u = c.var.user, email = c.req.param("email");
    if (u.email === email || !u.policy.isSuper) return c.json({ error: "forbidden" }, 403);
    db.delete(members).where(eq(members.email, email)).run();
    bus.emit("team"); bus.emit("tasks");
    return c.json({ ok: true });
  })
  .get("/:email/photo", c => {
    const u = c.var.user;
    if (!u.owner && !u.member) return c.json({ error: "forbidden" }, 403);
    const row = db.select({ photo: members.photo }).from(members).where(eq(members.email, c.req.param("email"))).get();
    if (!row?.photo) return c.body(null, 404);
    return c.body(new Uint8Array(row.photo), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" });
  })
  .put("/:email/photo", async c => {
    const u = c.var.user, email = c.req.param("email");
    if (u.email !== email && !u.policy.canManage(email)) return c.json({ error: "forbidden" }, 403);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!isJpeg(bytes) || bytes.length > MAX_PHOTO) return c.json({ error: "Foto harus JPG dan kurang dari 150 KB" }, 400);
    const cur = db.select({ v: members.photoV }).from(members).where(eq(members.email, email)).get();
    if (!cur) return c.json({ error: "not found" }, 404);
    db.update(members).set({ photo: Buffer.from(bytes), photoV: Math.abs(cur.v) + 1 }).where(eq(members.email, email)).run();
    bus.emit("team");
    return c.json({ ok: true });
  })
  .delete("/:email/photo", c => {
    const u = c.var.user, email = c.req.param("email");
    if (u.email !== email && !u.policy.canManage(email)) return c.json({ error: "forbidden" }, 403);
    const cur = db.select({ v: members.photoV }).from(members).where(eq(members.email, email)).get();
    if (!cur) return c.json({ error: "not found" }, 404);
    // Negative = no photo; the number keeps growing so cached URLs (?v=) never go stale.
    db.update(members).set({ photo: null, photoV: -(Math.abs(cur.v) + 1) }).where(eq(members.email, email)).run();
    bus.emit("team");
    return c.json({ ok: true });
  });

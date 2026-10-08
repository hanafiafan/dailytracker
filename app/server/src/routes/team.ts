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

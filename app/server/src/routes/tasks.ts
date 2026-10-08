import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, inArray } from "drizzle-orm";
import { commentCreate, taskCreate, taskReport, taskStatus } from "@shared/schemas";
import { addDays, weekday, wib } from "@shared/time";
import { comments, members, proofs, routines, tasks } from "../db/schema.js";
import { toComment, toTask } from "../dto.js";
import { loadTeam, newId, type AppEnv, type Deps } from "../context.js";
import type { Notify } from "../notify.js";

const MAX_PROOF = 1_500_000;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const taskRoutes = ({ db, bus }: Deps, notify: Notify) => {
  const find = (id: string) => db.select().from(tasks).where(eq(tasks.id, id)).get();
  const touch = () => bus.emit("tasks");

  return new Hono<AppEnv>()
    // Tasks from `from` onward that the caller may see.
    .get("/", c => {
      const u = c.var.user, from = c.req.query("from") ?? addDays(wib().date, -30);
      const team = loadTeam(db);
      const visible = u.policy.isBoss ? null : team.map(m => m.email).filter(e => u.policy.canSee(e));
      if (visible && !visible.length) return c.json([]);
      const rows = db.select().from(tasks)
        .where(visible ? and(gte(tasks.date, from), inArray(tasks.email, visible)) : gte(tasks.date, from)).all();
      const cs = rows.length ? db.select().from(comments).where(inArray(comments.taskId, rows.map(r => r.id))).all() : [];
      const byTask = Map.groupBy(cs, x => x.taskId);
      return c.json(rows.map(r => toTask(r, (byTask.get(r.id) ?? []).sort((a, b) => a.at - b.at))));
    })
    .post("/", zValidator("json", taskCreate), c => {
      const u = c.var.user, b = c.req.valid("json"), now = Date.now(), today = wib().date;
      const team = loadTeam(db);
      const emails = [...new Set(b.emails)];
      for (const e of emails) if (!team.some(m => m.email === e)) return c.json({ error: "Anggota tidak ditemukan" }, 404);

      if (!u.policy.isManager) {
        // A member may only add a plain task for themself.
        if (!u.member || emails.length !== 1 || emails[0] !== u.email || b.routineDays) return c.json({ error: "forbidden" }, 403);
        const id = newId();
        db.insert(tasks).values({ id, email: u.email, date: b.date ?? today, title: b.title, note: "", start: b.start ?? null, due: b.due ?? null, needProof: false, by: "self", createdAt: now }).run();
        touch();
        return c.json({ ids: [id] }, 201);
      }
      if (emails.some(e => !u.policy.canManage(e))) return c.json({ error: "forbidden" }, 403);

      const made: (typeof tasks.$inferSelect)[] = [];
      db.transaction(tx => {
        for (const email of emails) {
          const base = { email, title: b.title, note: b.note, start: b.start ?? null, due: b.due ?? null, hot: b.hot, needProof: b.needProof, by: "owner" as const, fromAdmin: u.member?.name ?? u.name, createdAt: now };
          if (b.routineDays?.length) {
            const rid = newId(4);
            tx.insert(routines).values({ id: rid, email, title: b.title, note: b.note, start: base.start, due: base.due, days: [...new Set(b.routineDays)].sort(), hot: b.hot, needProof: b.needProof, byName: base.fromAdmin }).run();
            if (b.routineDays.includes(weekday(today))) {
              const row = { ...base, id: `r-${rid}-${today}`, date: today, routineId: rid } as typeof tasks.$inferInsert;
              tx.insert(tasks).values(row).run();
            }
          } else {
            const row = { ...base, id: newId(), date: b.date ?? today } as typeof tasks.$inferInsert;
            tx.insert(tasks).values(row).run();
            made.push(tx.select().from(tasks).where(eq(tasks.id, row.id!)).get()!);
          }
          tx.update(members).set({ askAt: null }).where(eq(members.email, email)).run();
        }
      });
      made.forEach(t => void notify.newTask(t));
      touch(); bus.emit("team");
      return c.json({ ids: made.map(t => t.id) }, 201);
    })
    .patch("/:id/status", zValidator("json", taskStatus), c => {
      const u = c.var.user, t = find(c.req.param("id")), { status } = c.req.valid("json");
      if (!t) return c.json({ error: "not found" }, 404);
      const own = u.email === t.email && !!u.member;
      if (!own && !u.policy.canManage(t.email)) return c.json({ error: "forbidden" }, 403);
      // Members finish a task through /complete (proof); managers can set it directly.
      if (status === "done" && !u.policy.canManage(t.email)) return c.json({ error: "Selesaikan tugas lewat form bukti" }, 400);
      const now = Date.now();
      db.update(tasks).set({
        status,
        doneAt: status === "done" ? now : null,
        ...(status === "done" ? { returnedAt: null } : {}),
        ...(status === "doing" && !t.startedAt ? { startedAt: now } : {}),
      }).where(eq(tasks.id, t.id)).run();
      touch();
      if (status === "done") void notify.done({ ...t, status }, u.email);
      return c.json({ ok: true });
    })
    // Mark done with proof: multipart { photo?: JPEG, link?, note?, skipProof? }.
    .post("/:id/complete", async c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      const own = u.email === t.email && !!u.member;
      if (!own && !u.policy.canManage(t.email)) return c.json({ error: "forbidden" }, 403);
      const form = await c.req.parseBody();
      const photo = form.photo instanceof File && form.photo.size ? new Uint8Array(await form.photo.arrayBuffer()) : null;
      let link = typeof form.link === "string" ? form.link.trim() : "";
      const note = typeof form.note === "string" ? form.note.trim().slice(0, 600) : "";
      const skip = form.skipProof === "1";
      if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
      if (link && !URL.canParse(link)) return c.json({ error: "Link tidak valid" }, 400);
      if (photo && (!isJpeg(photo) || photo.length > MAX_PROOF)) return c.json({ error: "Foto harus JPG dan kurang dari 1,5 MB" }, 400);
      if (!skip && !photo && !link) return c.json({ error: "Lampirkan foto atau link sebagai bukti" }, 400);
      if (skip && t.needProof && !u.policy.canManage(t.email)) return c.json({ error: "Tugas ini wajib bukti" }, 400);
      const now = Date.now();
      db.transaction(tx => {
        if (photo) tx.insert(proofs).values({ taskId: t.id, data: Buffer.from(photo), at: now }).onConflictDoUpdate({ target: proofs.taskId, set: { data: Buffer.from(photo), at: now } }).run();
        if (!skip && !photo) tx.delete(proofs).where(eq(proofs.taskId, t.id)).run();
        tx.update(tasks).set({
          status: "done", doneAt: now, returnedAt: null,
          ...(skip ? {} : { proofLink: link || null, proofAt: now, hasPhoto: !!photo }),
          ...(note ? { report: note, reportAt: now } : {}),
        }).where(eq(tasks.id, t.id)).run();
      });
      touch();
      void notify.done({ ...t, status: "done" }, u.email);
      return c.json({ ok: true });
    })
    .post("/:id/return", c => {
      const u = c.var.user, t = find(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!u.policy.canManage(t.email) || t.status !== "done" || t.by === "self") return c.json({ error: "forbidden" }, 403);
      db.update(tasks).set({ status: "doing", doneAt: null, returnedAt: Date.now() }).where(eq(tasks.id, t.id)).run();
      touch();
      void notify.returned(t);
      return c.json({ ok: true });
    })

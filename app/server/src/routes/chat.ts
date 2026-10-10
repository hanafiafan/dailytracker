import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { makePolicy } from "@shared/policy";
import { messageCreate, type ChannelDTO, type ChatRefDTO, type MessageDTO } from "@shared/schemas";
import { attachments, channelReads, messages, projects, tasks } from "../db/schema.js";
import { loadTeam, newId, type AppEnv, type Deps } from "../context.js";
import type { Notify } from "../notify.js";

const MAX_FILE = 8 * 1024 * 1024;
const PAGE = 60;
const GENERAL = "general";

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
/** Allowed attachment types, each checked against the file's real first bytes (the declared type is never trusted). Images show inline, everything else downloads. */
const TYPES: Record<string, { inline: boolean; ok: (b: Uint8Array) => boolean }> = {
  "image/jpeg": { inline: true, ok: b => startsWith(b, [0xff, 0xd8, 0xff]) },
  "image/png": { inline: true, ok: b => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  "image/gif": { inline: true, ok: b => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  "image/webp": { inline: true, ok: b => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  "application/pdf": { inline: false, ok: b => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  "application/zip": { inline: false, ok: b => startsWith(b, [0x50, 0x4b]) },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { inline: false, ok: b => startsWith(b, [0x50, 0x4b]) },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { inline: false, ok: b => startsWith(b, [0x50, 0x4b]) },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { inline: false, ok: b => startsWith(b, [0x50, 0x4b]) },
  "text/plain": { inline: false, ok: b => !b.includes(0) },
  "text/csv": { inline: false, ok: b => !b.includes(0) },
};
const cleanName = (n: string) => n.replace(/[\\/\u0000-\u001f"<>|?*]/g, "_").trim().slice(0, 120) || "berkas";

// Team chat: one general channel, one per project. Who may read a channel is derived from the project, never stored.
export const chatRoutes = ({ db, bus, env }: Deps, notify: Notify) => {
  const team = () => loadTeam(db);
  const projectOf = (channel: string) => channel.startsWith("p-") ? db.select().from(projects).where(eq(projects.id, channel.slice(2))).get() : undefined;
  /** May this person read and write in this channel? Managers: every channel. Members: general, and projects they have a task in. */
  const canAccess = (email: string, owner: boolean, channel: string) => {
    const t = team(), p = makePolicy(email, owner, t), me = t.find(m => m.email === email);
    if (!owner && !me) return false;
    if (channel === GENERAL) return true;
    const proj = projectOf(channel);
    if (!proj) return false;
    return p.isManager || !!db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, proj.id), eq(tasks.email, email))).get();
  };
  const ownerOf = (email: string) => email === env.OWNER_EMAIL;

  const labelRefs = (refs: { type: "member" | "task" | "project"; id: string }[], viewer: { policy: ReturnType<typeof makePolicy> }): ChatRefDTO[] => {
    const t = team();
    return refs.map(r => {
      if (r.type === "member") { const m = t.find(x => x.email === r.id); return { ...r, label: m?.name ?? r.id, ok: !!m }; }
      if (r.type === "project") { const p = db.select().from(projects).where(eq(projects.id, r.id)).get(); return { ...r, label: p?.name ?? "Proyek dihapus", ok: !!p }; }
      const k = db.select().from(tasks).where(eq(tasks.id, r.id)).get();
      return k && viewer.policy.canSee(k.email) ? { ...r, label: k.title, ok: true } : { ...r, label: "Tugas", ok: false };
    });
  };
  const toMessage = (m: typeof messages.$inferSelect, files: { id: string; name: string; mime: string; size: number }[], viewer: { policy: ReturnType<typeof makePolicy> }): MessageDTO => ({
    id: m.id, channel: m.channel, email: m.email, name: team().find(x => x.email === m.email)?.name ?? (ownerOf(m.email) ? "Superadmin" : m.email),
    text: m.deletedAt ? "" : m.text, refs: m.deletedAt ? [] : labelRefs(m.refs, viewer), attachments: m.deletedAt ? [] : files, createdAt: m.createdAt, deleted: !!m.deletedAt,
  });
  const filesOf = (ids: string[]) => ids.length ? db.select({ id: attachments.id, name: attachments.name, mime: attachments.mime, size: attachments.size, messageId: attachments.messageId }).from(attachments).where(inArray(attachments.messageId, ids)).all() : [];

  return new Hono<AppEnv>()
    .get("/channels", c => {
      const u = c.var.user, out: ChannelDTO[] = [];
      const reads = new Map(db.select().from(channelReads).where(eq(channelReads.email, u.email)).all().map(r => [r.channel, r.readAt]));
      const info = (id: string) => {
        const last = db.select().from(messages).where(and(eq(messages.channel, id), isNull(messages.deletedAt))).orderBy(desc(messages.createdAt)).get();
        const unread = db.select({ n: sql<number>`count(*)` }).from(messages).where(and(eq(messages.channel, id), isNull(messages.deletedAt), ne(messages.email, u.email), gt(messages.createdAt, reads.get(id) ?? 0))).get()?.n ?? 0;
        return { unread, last: last ? { text: last.text || "Lampiran", name: team().find(x => x.email === last.email)?.name ?? "Superadmin", at: last.createdAt } : null };
      };
      if (canAccess(u.email, u.owner, GENERAL)) out.push({ id: GENERAL, kind: "general", name: "Umum", projectId: null, color: null, ...info(GENERAL) });
      for (const p of db.select().from(projects).orderBy(asc(projects.createdAt)).all()) {
        const id = "p-" + p.id;
        if (p.archived || !canAccess(u.email, u.owner, id)) continue;
        out.push({ id, kind: "project", name: p.name, projectId: p.id, color: p.color as ChannelDTO["color"], ...info(id) });
      }
      return c.json(out);
    })
    .get("/channels/:id/messages", c => {
      const u = c.var.user, ch = c.req.param("id");
      if (!canAccess(u.email, u.owner, ch)) return c.json({ error: "forbidden" }, 403);
      const before = Number(c.req.query("before")) || Number.MAX_SAFE_INTEGER;
      const rows = db.select().from(messages).where(and(eq(messages.channel, ch), lt(messages.createdAt, before))).orderBy(desc(messages.createdAt)).limit(PAGE).all().reverse();
      const files = filesOf(rows.map(r => r.id));
      return c.json({ messages: rows.map(r => toMessage(r, files.filter(f => f.messageId === r.id), u)), more: rows.length === PAGE });
    })
    .post("/channels/:id/messages", zValidator("json", messageCreate), c => {
      const u = c.var.user, ch = c.req.param("id"), b = c.req.valid("json");
      if (!canAccess(u.email, u.owner, ch)) return c.json({ error: "forbidden" }, 403);
      if (!b.text && !b.attachmentIds.length) return c.json({ error: "Tulis pesan atau lampirkan berkas." }, 400);
      const t = team();
      for (const r of b.refs) {
        const ok = r.type === "member" ? t.some(m => m.email === r.id) : r.type === "project" ? !!db.select({ id: projects.id }).from(projects).where(eq(projects.id, r.id)).get()
          : (() => { const k = db.select().from(tasks).where(eq(tasks.id, r.id)).get(); return !!k && u.policy.canSee(k.email); })();
        if (!ok) return c.json({ error: "Tautan ke tugas, proyek, atau orang tidak valid." }, 400);
      }
      const files = b.attachmentIds.length ? db.select({ id: attachments.id }).from(attachments).where(and(inArray(attachments.id, b.attachmentIds), eq(attachments.email, u.email), eq(attachments.channel, ch), isNull(attachments.messageId))).all() : [];
      if (files.length !== b.attachmentIds.length) return c.json({ error: "Lampiran tidak ditemukan. Unggah ulang." }, 400);
      const id = newId(), now = Date.now();
      db.transaction(tx => {
        tx.insert(messages).values({ id, channel: ch, email: u.email, text: b.text, refs: b.refs, createdAt: now }).run();
        if (files.length) tx.update(attachments).set({ messageId: id }).where(inArray(attachments.id, files.map(f => f.id))).run();
        tx.insert(channelReads).values({ email: u.email, channel: ch, readAt: now }).onConflictDoUpdate({ target: [channelReads.email, channelReads.channel], set: { readAt: now } }).run();
      });
      bus.emit("chat");
      const who = u.member?.name ?? u.name, chName = ch === GENERAL ? "Umum" : projectOf(ch)?.name ?? "chat";
      const to = [...new Set(b.refs.filter(r => r.type === "member" && r.id !== u.email).map(r => r.id))].filter(e => canAccess(e, ownerOf(e), ch));
      if (to.length) void notify.chatMention(to, chName, ch, who, b.text || "Lampiran");
      return c.json({ id }, 201);
    })
    .post("/channels/:id/read", c => {
      const u = c.var.user, ch = c.req.param("id");
      if (!canAccess(u.email, u.owner, ch)) return c.json({ error: "forbidden" }, 403);
      const now = Date.now();
      db.insert(channelReads).values({ email: u.email, channel: ch, readAt: now }).onConflictDoUpdate({ target: [channelReads.email, channelReads.channel], set: { readAt: now } }).run();
      bus.emit("chat");
      return c.json({ ok: true });
    })
    .delete("/messages/:id", c => {
      const u = c.var.user, m = db.select().from(messages).where(eq(messages.id, c.req.param("id"))).get();
      if (!m) return c.json({ ok: true });
      if (m.email !== u.email && !u.policy.canManage(m.email)) return c.json({ error: "forbidden" }, 403);
      db.update(messages).set({ deletedAt: Date.now(), text: "" }).where(eq(messages.id, m.id)).run();
      db.delete(attachments).where(eq(attachments.messageId, m.id)).run();
      bus.emit("chat");
      return c.json({ ok: true });
    })
    // Upload first, attach on send. 8 MB each; the global 2 MB request limit is lifted for this one route only.
    .post("/attachments", bodyLimit({ maxSize: MAX_FILE + 512 * 1024, onError: c => c.json({ error: "Berkas terlalu besar (maksimal 8 MB)." }, 413) }), async c => {
      const u = c.var.user, form = await c.req.parseBody(), ch = String(form.channel ?? ""), f = form.file;
      if (!canAccess(u.email, u.owner, ch)) return c.json({ error: "forbidden" }, 403);
      if (!(f instanceof File)) return c.json({ error: "Pilih berkas dulu." }, 400);
      if (f.size > MAX_FILE) return c.json({ error: "Berkas terlalu besar (maksimal 8 MB)." }, 413);
      const type = TYPES[f.type], bytes = new Uint8Array(await f.arrayBuffer());
      if (!type || !bytes.length || !type.ok(bytes)) return c.json({ error: "Jenis berkas tidak didukung. Gunakan gambar, PDF, dokumen Office, ZIP, TXT, atau CSV." }, 400);
      db.delete(attachments).where(and(isNull(attachments.messageId), lt(attachments.createdAt, Date.now() - 864e5))).run();
      const row = { id: newId(), messageId: null, channel: ch, email: u.email, name: cleanName(f.name), mime: f.type, size: bytes.length, data: Buffer.from(bytes), createdAt: Date.now() };
      db.insert(attachments).values(row).run();
      return c.json({ id: row.id, name: row.name, mime: row.mime, size: row.size }, 201);
    })
    .get("/files/:id", c => {
      const u = c.var.user, a = db.select().from(attachments).where(eq(attachments.id, c.req.param("id"))).get();
      if (!a || !canAccess(u.email, u.owner, a.channel) || (!a.messageId && a.email !== u.email)) return c.json({ error: "not found" }, 404);
      const inline = TYPES[a.mime]?.inline ?? false;
      return c.body(new Uint8Array(a.data), 200, {
        "content-type": a.mime, "cache-control": "private, max-age=3600",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        "content-security-policy": "sandbox; default-src 'none'",
      });
    });
};

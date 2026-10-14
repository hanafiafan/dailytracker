import { Hono } from "hono";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { makePolicy, isBOMember, isDirectorMember } from "@shared/policy";
import { groupInput, groupPatch, messageCreate, type ChannelDTO, type ChatRefDTO, type MessageDTO } from "@shared/schemas";
import { attachments, channelReads, chatGroupMembers, chatGroups, members, messages, projects, tasks } from "../db/schema.js";
import { loadTeam, newId, type AppEnv, type Deps, type User } from "../context.js";
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

const MAX_PHOTO = 150_000;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// Team chat: one general channel, one per project. Who may read a channel is derived from the project, never stored.
export const chatRoutes = ({ db, bus, env }: Deps, notify: Notify) => {
  const team = () => loadTeam(db);
  const projectOf = (channel: string) => channel.startsWith("p-") ? db.select().from(projects).where(eq(projects.id, channel.slice(2))).get() : undefined;
  /** May this person read and write in this channel? Managers: every channel. Members: general, and projects they have a task in. */
  const groupAccess = (email: string, gid: string) => {
    const g = db.select().from(chatGroups).where(eq(chatGroups.id, gid)).get();
    if (!g) return false;
    if (g.createdBy.toLowerCase() === email.toLowerCase()) return true;
    const ms = db.select({ email: chatGroupMembers.email }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, gid)).all();
    return ms.some(m => m.email.toLowerCase() === email.toLowerCase());
  };
  /** Edit name, description, photo, members: creator, superadmin, or role admin keatas in group */
  const groupAdmin = (u: User, gid: string) => {
    const g = db.select().from(chatGroups).where(eq(chatGroups.id, gid)).get();
    if (!g) return undefined;
    if (!canAccess(u.email, u.owner, "g-" + gid)) return undefined;
    const isCreator = g.createdBy.toLowerCase() === u.email.toLowerCase();
    const isAdminUp = u.owner || u.policy.isAdmin || u.policy.isBoss || u.policy.isSuper || u.policy.isManager;
    return (isCreator || isAdminUp) ? g : undefined;
  };
  const setMembers = (tx: Pick<typeof db, "delete" | "insert">, gid: string, emails: string[]) => {
    tx.delete(chatGroupMembers).where(eq(chatGroupMembers.groupId, gid)).run();
    for (const email of new Set(emails)) {
      if (!db.select().from(members).where(eq(members.email, email)).get()) {
        if (email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()) {
          db.insert(members).values({
            email,
            name: "Superadmin",
            role: "Superadmin",
            sortOrder: 0,
            isAdmin: true,
          }).onConflictDoNothing().run();
        }
      }
      if (db.select().from(members).where(eq(members.email, email)).get()) {
        tx.insert(chatGroupMembers).values({ groupId: gid, email }).run();
      }
    }
  };
  const canAccess = (email: string, owner: boolean, channel: string) => {
    const isSuperadmin = owner || email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
    if (isSuperadmin) {
      if (channel === GENERAL) return true; // Kanal Umum terbuka untuk semuanya
      if (channel.startsWith("dm:")) {
        const parts = channel.slice(3).split(":").map(p => p.toLowerCase());
        return parts.includes(email.toLowerCase());
      }
      if (channel.startsWith("g-")) {
        return groupAccess(email, channel.slice(2));
      }
      // bo-direktur dan kanal proyek disembunyikan sepenuhnya dari Superadmin
      return false;
    }
    const t = team(), p = makePolicy(email, owner, t), me = t.find(m => m.email === email);
    if (!me) return false;
    if (channel === GENERAL) return true; // Kanal Umum terbuka untuk semuanya
    if (channel === "bo-direktur") return p.isBO || p.isDirector;
    if (p.isBO) {
      if (channel.startsWith("dm:")) {
        const parts = channel.slice(3).split(":");
        return parts.includes(email);
      }
      if (channel.startsWith("g-")) {
        const ms = db.select({ email: chatGroupMembers.email }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, channel.slice(2))).all().map(x => x.email);
        return ms.every(e => e === email || isDirectorMember(t.find(x => x.email === e)));
      }
      return false;
    }
    if (channel.startsWith("dm:")) {
      const parts = channel.slice(3).split(":");
      return parts.includes(email);
    }
    if (channel.startsWith("g-")) return groupAccess(email, channel.slice(2));
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
      if (canAccess(u.email, u.owner, "bo-direktur")) {
        out.unshift({
          id: "bo-direktur",
          kind: "group",
          name: "BO & Direktur",
          description: "Kanal koordinasi khusus Brand Owner & Direktur",
          projectId: null,
          color: "yellow",
          ...info("bo-direktur"),
          group: {
            members: team().filter(x => isBOMember(x) || isDirectorMember(x)).map(x => x.email),
            createdBy: u.email,
            canManage: false,
            description: "Kanal koordinasi khusus Brand Owner & Direktur",
          },
        });
      }
      if (canAccess(u.email, u.owner, GENERAL)) {
        out.push({
          id: GENERAL,
          kind: "general",
          name: "Umum",
          description: "Forum diskusi terbuka untuk seluruh anggota tim",
          projectId: null,
          color: null,
          ...info(GENERAL),
          group: {
            members: team().map(x => x.email),
            createdBy: "system",
            canManage: false,
            description: "Forum diskusi terbuka untuk seluruh anggota tim",
          },
        });
      }
      for (const p of db.select().from(projects).orderBy(asc(projects.createdAt)).all()) {
        const id = "p-" + p.id;
        if (p.archived || !canAccess(u.email, u.owner, id)) continue;
        const projectTaskEmails = db.select({ email: tasks.email }).from(tasks).where(eq(tasks.projectId, p.id)).all().map(x => x.email);
        const membersList = Array.from(new Set([...projectTaskEmails, ...team().filter(m => m.isAdmin).map(m => m.email)]));
        out.push({
          id,
          kind: "project",
          name: p.name,
          description: p.description || `Kanal proyek ${p.name}`,
          projectId: p.id,
          color: p.color as ChannelDTO["color"],
          ...info(id),
          group: {
            members: membersList,
            createdBy: "system",
            canManage: false,
            description: p.description || `Kanal proyek ${p.name}`,
          },
        });
      }
      const mine = db.select().from(chatGroups).orderBy(asc(chatGroups.createdAt)).all();
      for (const g of mine) {
        const id = "g-" + g.id;
        if (!canAccess(u.email, u.owner, id)) continue;
        const ms = db.select({ email: chatGroupMembers.email }).from(chatGroupMembers).where(eq(chatGroupMembers.groupId, g.id)).all().map(x => x.email);
        const canManage = !!groupAdmin(u, g.id);
        out.push({
          id,
          kind: "group",
          name: g.name,
          description: g.description,
          projectId: null,
          color: null,
          ...info(id),
          group: {
            members: ms,
            createdBy: g.createdBy,
            canManage,
            description: g.description,
            hasPhoto: (g.photoV || 0) > 0,
            photoV: g.photoV || 0,
          },
        });
      }

      // Direct Message (DM) channels
      const dmRows = db.select({ channel: messages.channel }).from(messages)
        .where(and(sql`${messages.channel} LIKE 'dm:%'`, isNull(messages.deletedAt)))
        .groupBy(messages.channel)
        .all();

      const allTeam = team();
      for (const row of dmRows) {
        const parts = row.channel.slice(3).split(":");
        if (parts.length < 2 || !parts.some(p => p.toLowerCase() === u.email.toLowerCase())) continue;
        const otherEmail = (parts[0]?.toLowerCase() === u.email.toLowerCase() ? parts[1] : parts[0]) ?? "";
        if (!otherEmail) continue;
        const other = allTeam.find(m => m.email.toLowerCase() === otherEmail.toLowerCase());
        const name = other?.name ?? otherEmail ?? "Chat Pribadi";
        out.push({
          id: row.channel,
          kind: "dm",
          name,
          projectId: null,
          color: "lilac",
          dmUser: other ? {
            email: other.email,
            name: other.name,
            role: other.role,
            group: other.group,
            jobdesk: other.jobdesk,
            level: other.level,
            hasPhoto: other.photoV > 0,
            photoV: other.photoV,
          } : undefined,
          ...info(row.channel),
        });
      }

      return c.json(out);
    })
    .post("/dm", zValidator("json", z.object({ targetEmail: z.string().email() })), c => {
      const u = c.var.user, { targetEmail } = c.req.valid("json");
      const t = team();
      const target = t.find(m => m.email === targetEmail);
      if (!target && targetEmail !== env.OWNER_EMAIL) return c.json({ error: "Anggota tidak ditemukan" }, 404);
      const pair = [u.email, targetEmail].sort();
      const channelId = `dm:${pair[0]}:${pair[1]}`;
      bus.emit("chat");
      return c.json({ channelId, name: target?.name ?? targetEmail });
    })
    // ---- groups: any team member can start one and pick who is in it
    .post("/groups", zValidator("json", groupInput), c => {
      const u = c.var.user, b = c.req.valid("json"), t = team();
      if (!u.owner && !u.member) return c.json({ error: "forbidden" }, 403);
      if (b.emails.some(e => !t.some(m => m.email === e) && e !== env.OWNER_EMAIL)) return c.json({ error: "Anggota tidak ditemukan" }, 404);
      if (!u.owner && u.policy.isBO && b.emails.some(e => !isDirectorMember(t.find(x => x.email === e)))) {
        return c.json({ error: "BO hanya dapat terhubung dengan Direktur" }, 403);
      }
      if (!u.owner && !u.policy.isDirector && !u.policy.isBO && b.emails.some(e => isBOMember(t.find(x => x.email === e)))) {
        return c.json({ error: "Hanya Direktur yang dapat berkomunikasi dengan BO" }, 403);
      }
      const id = newId();
      db.transaction(tx => {
        tx.insert(chatGroups).values({ id, name: b.name, description: b.description || "", createdBy: u.email, createdAt: Date.now() }).run();
        setMembers(tx, id, [...b.emails, u.email]);
      });
      bus.emit("chat");
      return c.json({ id: "g-" + id }, 201);
    })
    .get("/groups/:id/photo", c => {
      const u = c.var.user, gid = c.req.param("id");
      if (!canAccess(u.email, u.owner, "g-" + gid)) return c.json({ error: "forbidden" }, 403);
      const g = db.select({ photo: chatGroups.photo }).from(chatGroups).where(eq(chatGroups.id, gid)).get();
      if (!g?.photo) return c.body(null, 404);
      return c.body(new Uint8Array(g.photo), 200, { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable" });
    })
    .put("/groups/:id/photo", async c => {
      const u = c.var.user, gid = c.req.param("id");
      const g = groupAdmin(u, gid);
      if (!g) return c.json({ error: "forbidden" }, 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (!isJpeg(bytes) || bytes.length > MAX_PHOTO) return c.json({ error: "Foto harus JPG dan kurang dari 150 KB" }, 400);
      db.update(chatGroups).set({ photo: Buffer.from(bytes), photoV: Math.abs(g.photoV || 0) + 1 }).where(eq(chatGroups.id, gid)).run();
      bus.emit("chat");
      return c.json({ ok: true });
    })
    .delete("/groups/:id/photo", c => {
      const u = c.var.user, gid = c.req.param("id");
      const g = groupAdmin(u, gid);
      if (!g) return c.json({ error: "forbidden" }, 403);
      db.update(chatGroups).set({ photo: null, photoV: -(Math.abs(g.photoV || 0) + 1) }).where(eq(chatGroups.id, gid)).run();
      bus.emit("chat");
      return c.json({ ok: true });
    })
    .patch("/groups/:id", zValidator("json", groupPatch), c => {
      const u = c.var.user, gid = c.req.param("id"), b = c.req.valid("json");
      const g = groupAdmin(u, gid);
      if (!g) return c.json({ error: "forbidden" }, 403);
      if (b.emails && b.emails.some(e => !team().some(m => m.email === e) && e !== env.OWNER_EMAIL)) return c.json({ error: "Anggota tidak ditemukan" }, 404);
      db.transaction(tx => {
        const patch: Record<string, any> = {};
        if (b.name) patch.name = b.name;
        if (b.description !== undefined) patch.description = b.description;
        if (Object.keys(patch).length > 0) tx.update(chatGroups).set(patch).where(eq(chatGroups.id, gid)).run();
        if (b.emails) setMembers(tx, gid, [...b.emails, g.createdBy]);
      });
      bus.emit("chat");
      return c.json({ ok: true });
    })
    .post("/groups/:id/leave", c => {
      const u = c.var.user, gid = c.req.param("id");
      db.delete(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, gid), eq(chatGroupMembers.email, u.email))).run();
      bus.emit("chat");
      return c.json({ ok: true });
    })
    .delete("/groups/:id", c => {
      const u = c.var.user, gid = c.req.param("id");
      const g = db.select().from(chatGroups).where(eq(chatGroups.id, gid)).get();
      if (!g) return c.json({ error: "not found" }, 404);
      if (!u.owner && !groupAdmin(u, gid)) return c.json({ error: "forbidden" }, 403);
      db.transaction(tx => {
        tx.delete(attachments).where(eq(attachments.channel, "g-" + gid)).run();
        tx.delete(messages).where(eq(messages.channel, "g-" + gid)).run();
        tx.delete(channelReads).where(eq(channelReads.channel, "g-" + gid)).run();
        tx.delete(chatGroups).where(eq(chatGroups.id, gid)).run();
      });
      bus.emit("chat");
      return c.json({ ok: true });
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
      const who = u.member?.name ?? u.name, chName = ch === GENERAL ? "Umum" : ch.startsWith("g-") ? db.select().from(chatGroups).where(eq(chatGroups.id, ch.slice(2))).get()?.name ?? "grup" : projectOf(ch)?.name ?? "chat";
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

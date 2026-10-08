// One-off: copy the data of the first version (JSON documents in tugas.db) into the new tables.
//   node dist/migrate-legacy.js <old tugas.db> <new app.db> [dailytask-export.json]
// The optional export (from the claude.ai version) adds the admin links. Safe to re-run; existing rows are replaced.
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { openDb } from "../db/index.js";
import { comments, links, members, meta, proofs, pushSubs, routines, sessions, tasks } from "../db/schema.js";

const [oldPath, newPath, exportPath] = process.argv.slice(2);
if (!oldPath || !newPath) { console.error("usage: migrate-legacy <old tugas.db> <new app.db> [export.json]"); process.exit(1); }

type Doc = Record<string, any>; // legacy documents are schemaless JSON
const old = new Database(oldPath, { readonly: true, fileMustExist: true });
const rows = (sql: string, ...args: unknown[]) => old.prepare(sql).all(...args) as { id: string; col: string; data: string }[];
const parse = (r: { data: string }): Doc => JSON.parse(r.data);
const photoBytes = (dataUrl: unknown) => typeof dataUrl === "string" && dataUrl.startsWith("data:") ? Buffer.from(dataUrl.split(",")[1] ?? "", "base64") : null;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

const db = openDb(newPath);
const out = { members: 0, tasks: 0, proofs: 0, comments: 0, routines: 0, push: 0, sessions: 0, links: 0 };

db.transaction(tx => {
  const askAt = new Map<string, number | null>();
  for (const r of rows("SELECT id, col, data FROM docs WHERE col = 'tasks'")) askAt.set(r.id, num(parse(r).askAt));

  for (const r of rows("SELECT id, col, data FROM docs WHERE col = 'team'")) {
    const d = parse(r), photo = photoBytes(d.photo);
    const v = {
      email: r.id, name: String(d.name ?? r.id), role: String(d.role ?? ""), group: String(d.group ?? ""), isAdmin: !!d.isAdmin,
      adminGroups: Array.isArray(d.adminGroups) ? d.adminGroups.map(String) : [], sortOrder: num(d.order) ?? 999,
      photo, photoV: photo ? 1 : 0, seenAt: num(d.seenAt), askAt: askAt.get(r.id) ?? null,
    };
    tx.insert(members).values(v).onConflictDoUpdate({ target: members.email, set: v }).run();
    out.members++;
  }
  const team = new Set(tx.select({ e: members.email }).from(members).all().map(m => m.e));

  for (const r of rows("SELECT id, col, data FROM docs WHERE col = 'tasks'")) {
    if (!team.has(r.id)) continue;
    for (const x of (parse(r).routines ?? []) as Doc[]) {
      const v = { id: String(x.id), email: r.id, title: String(x.title), note: String(x.note ?? ""), start: str(x.start), due: str(x.due),
        days: (x.days ?? []).map(Number), hot: !!x.hot, needProof: x.needProof !== false, byName: str(x.byName) };
      tx.insert(routines).values(v).onConflictDoUpdate({ target: routines.id, set: v }).run();
      out.routines++;
    }
  }

  for (const r of rows("SELECT id, col, data FROM docs WHERE col LIKE 'tasks/%/items'")) {
    const email = r.col.split("/")[1]!;
    if (!team.has(email)) continue;
    const d = parse(r), p = (d.proof ?? null) as Doc | null;
    const v = {
      id: r.id, email, date: String(d.date), title: String(d.title), note: String(d.note ?? ""), start: str(d.start), due: str(d.due),
      status: (["todo", "doing", "done"].includes(d.status) ? d.status : "todo") as "todo" | "doing" | "done",
      hot: !!d.hot, needProof: d.needProof !== false, by: (d.by === "self" ? "self" : "owner") as "self" | "owner",
      fromAdmin: str(d.fromAdmin), routineId: str(d.routine), createdAt: num(d.createdAt) ?? Date.now(),
      startedAt: num(d.startedAt), doneAt: num(d.doneAt), returnedAt: num(d.returnedAt),
      proofLink: str(p?.link), proofAt: p ? num(p.at) ?? Date.now() : null, hasPhoto: !!p?.photo,
      report: str(d.report), reportAt: num(d.reportAt), remDue: !!d.remDue, remLate: !!d.remLate,
    };
    tx.insert(tasks).values(v).onConflictDoUpdate({ target: tasks.id, set: v }).run();
    out.tasks++;
    for (const c of (d.comments ?? []) as Doc[]) {
      const cv = { id: String(c.id), taskId: r.id, by: String(c.by ?? "?"), byEmail: "", text: String(c.text ?? ""), at: num(c.at) ?? Date.now() };
      tx.insert(comments).values(cv).onConflictDoUpdate({ target: comments.id, set: cv }).run();
      out.comments++;
    }
  }

  for (const r of rows("SELECT id, col, data FROM docs WHERE col LIKE 'proofs/%/items'")) {
    const data = photoBytes(parse(r).data);
    if (!data || !tx.select().from(tasks).all().some(t => t.id === r.id)) continue;
    tx.insert(proofs).values({ taskId: r.id, data, at: num(parse(r).at) ?? Date.now() }).onConflictDoUpdate({ target: proofs.taskId, set: { data } }).run();
    out.proofs++;
  }

  // Keep devices subscribed and people signed in: same VAPID keys, same session tokens (stored hashed now).
  for (const k of ["vapid_pub", "vapid_priv"]) {
    const m = old.prepare("SELECT v FROM meta WHERE k = ?").get(k) as { v: string } | undefined;
    if (m) tx.insert(meta).values({ k, v: m.v }).onConflictDoUpdate({ target: meta.k, set: { v: m.v } }).run();
  }
  for (const s of old.prepare("SELECT endpoint, email, sub FROM push").all() as { endpoint: string; email: string; sub: string }[]) {
    const v = { endpoint: s.endpoint, email: s.email, sub: JSON.parse(s.sub) };
    tx.insert(pushSubs).values(v).onConflictDoUpdate({ target: pushSubs.endpoint, set: v }).run();
    out.push++;
  }
  for (const s of old.prepare("SELECT token, email, exp FROM sessions WHERE exp > ?").all(Date.now()) as { token: string; email: string; exp: number }[]) {
    const v = { tokenHash: createHash("sha256").update(s.token).digest("hex"), email: s.email, name: s.email, exp: s.exp };
    tx.insert(sessions).values(v).onConflictDoNothing().run();
    out.sessions++;
  }

  if (exportPath) {
    const x = JSON.parse(readFileSync(exportPath, "utf8")) as { adminLinks?: Doc[] };
    for (const l of x.adminLinks ?? []) {
      const v = { id: String(l.id), title: String(l.title), url: String(l.url), createdAt: num(l.at) ?? Date.now() };
      tx.insert(links).values(v).onConflictDoUpdate({ target: links.id, set: v }).run();
      out.links++;
    }
  }
});
console.log("Dipindahkan:", JSON.stringify(out));

// SQLite storage: one `docs` table of JSON documents addressed by path (team/<email>, tasks/<email>/items/<id>, ...).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "tugas.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, exp INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS push (endpoint TEXT PRIMARY KEY, email TEXT NOT NULL, sub TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  const q = sql => db.prepare(sql);
  const s = {
    getDoc: q("SELECT id, data FROM docs WHERE path = ?"),
    putDoc: q("INSERT INTO docs(path, col, id, data) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET data = excluded.data"),
    delDoc: q("DELETE FROM docs WHERE path = ?"),
    getMeta: q("SELECT v FROM meta WHERE k = ?"),
    putMeta: q("INSERT INTO meta(k, v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"),
  };
  const split = path => { const i = path.lastIndexOf("/"); return i < 0 ? ["", path] : [path.slice(0, i), path.slice(i + 1)]; };
  const OPS = { "==": "=", ">=": ">=", "<=": "<=", ">": ">", "<": "<" };

  return {
    db,
    get(path) { const r = s.getDoc.get(path); return r ? { id: r.id, data: JSON.parse(r.data) } : null; },
    set(path, data) { const [col, id] = split(path); s.putDoc.run(path, col, id, JSON.stringify(data)); },
    del(path) { s.delDoc.run(path); },
    // filters: [[field, op, value]] on top-level fields, e.g. ["date", ">=", "2026-09-01"]
    list(col, filters = []) {
      const where = ["col = ?"], args = [col];
      for (const [f, op, v] of filters) {
        if (!/^\w+$/.test(f) || !OPS[op]) throw new Error("bad filter");
        where.push(`json_extract(data, '$.${f}') ${OPS[op]} ?`); args.push(v);
      }
      return db.prepare(`SELECT id, data FROM docs WHERE ${where.join(" AND ")}`).all(...args).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
    },
    // Every task of a given date across all people (reminders).
    itemsOn(date) {
      return db.prepare("SELECT path, id, col, data FROM docs WHERE col LIKE 'tasks/%/items' AND json_extract(data, '$.date') = ?").all(date)
        .map(r => ({ path: r.path, id: r.id, email: r.col.split("/")[1], data: JSON.parse(r.data) }));
    },
    meta: { get: k => (s.getMeta.get(k) || {}).v, set: (k, v) => s.putMeta.run(k, String(v)) },
    session: {
      make(email, days = 30) {
        const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
        db.prepare("INSERT INTO sessions(token, email, exp) VALUES(?,?,?)").run(token, email, Date.now() + days * 864e5);
        return token;
      },
      who(token) {
        const r = token && db.prepare("SELECT email, exp FROM sessions WHERE token = ?").get(token);
        if (!r) return null;
        if (r.exp < Date.now()) { db.prepare("DELETE FROM sessions WHERE token = ?").run(token); return null; }
        return r.email;
      },
      end: token => db.prepare("DELETE FROM sessions WHERE token = ?").run(token),
      purge: () => db.prepare("DELETE FROM sessions WHERE exp < ?").run(Date.now()),
    },
    push: {
      save: (endpoint, email, sub) => db.prepare("INSERT INTO push(endpoint, email, sub) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, sub = excluded.sub").run(endpoint, email, JSON.stringify(sub)),
      drop: endpoint => db.prepare("DELETE FROM push WHERE endpoint = ?").run(endpoint),
      of: email => db.prepare("SELECT endpoint, sub FROM push WHERE email = ?").all(email).map(r => ({ endpoint: r.endpoint, sub: JSON.parse(r.sub) })),
    },
  };
}

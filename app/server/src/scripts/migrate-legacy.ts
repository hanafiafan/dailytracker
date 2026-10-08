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


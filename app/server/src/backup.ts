import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { wib } from "@shared/time";
import { backupSettings, type BackupDTO, type BackupSettings } from "@shared/schemas";
import { meta } from "./db/schema.js";
import type { Db } from "./db/index.js";

/** auto = scheduled (pruned to `keep`), manual / pre-reset = kept until the superadmin deletes them. "app-" is the old one-per-day name. */
const NAME = /^(auto|app|manual|pre-reset)-[A-Za-z0-9._-]+\.db$/;
const kindOf = (f: string): BackupDTO["kind"] => f.startsWith("manual-") ? "manual" : f.startsWith("pre-reset-") ? "pre-reset" : "auto";
const stamp = (now: number) => { const w = wib(now); return `${w.date}-${String(w.hour).padStart(2, "0")}${String(w.minute).padStart(2, "0")}`; };

export function getBackupSettings(db: Db): BackupSettings {
  const row = db.select().from(meta).where(eq(meta.k, "backup")).get();
  try { return backupSettings.parse(JSON.parse(row?.v ?? "{}")); } catch { return backupSettings.parse({}); }
}
export function setBackupSettings(db: Db, s: BackupSettings) {
  const v = JSON.stringify(s);
  db.insert(meta).values({ k: "backup", v }).onConflictDoUpdate({ target: meta.k, set: { v } }).run();
}

export function listBackups(dir: string): BackupDTO[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => NAME.test(f)).map(f => { const s = statSync(join(dir, f)); return { file: f, kind: kindOf(f), size: s.size, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at);
}

const slugOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const newName = (kind: "manual" | "pre-reset", label: string, now: number) => `${kind}-${stamp(now)}-${(now % 1e6).toString(36)}${slugOf(label) && "-" + slugOf(label)}.db`;

/** Copies the live database (SQLite online backup, safe while the app runs). Returns the new file. */
export async function backupNow(db: Db, dir: string, kind: "manual" | "pre-reset", label = "", now = Date.now()) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, newName(kind, label, now));
  await db.sqlite.backup(file);
  return file;
}

/** True when the file is an intact copy of this app's database (opens, passes SQLite's check, has the team table). */
export function isBackupFile(path: string) {
  let c: Database.Database | undefined;
  try {
    c = new Database(path, { readonly: true });
    return c.pragma("quick_check", { simple: true }) === "ok" && !!c.prepare("SELECT 1 FROM sqlite_master WHERE name = 'members'").get();
  } catch { return false; } finally { c?.close(); }
}

/** Stores an uploaded database as a manual copy; null when it is not a valid backup. */
export function saveUpload(dir: string, bytes: Uint8Array, label: string, now = Date.now()) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `upload-${now}.tmp`);
  writeFileSync(tmp, bytes);
  const file = join(dir, newName("manual", "unggahan " + label, now));
  if (!isBackupFile(tmp)) { rmSync(tmp, { force: true }); return null; }
  renameSync(tmp, file);
  return file;
}

/** Replaces the live database with a stored copy. A "pre-reset" copy of the current data is taken first. The connection is closed afterwards, so the caller must restart the process (migrations then bring an older copy up to date). */
export async function restoreBackup(db: Db, dir: string, dbPath: string, name: string) {
  const src = join(dir, name);
  if (!NAME.test(name) || !isBackupFile(src)) return null;
  const before = await backupNow(db, dir, "pre-reset", "sebelum pulihkan");
  db.sqlite.close();
  copyFileSync(src, dbPath + ".restore");
  renameSync(dbPath + ".restore", dbPath);
  rmSync(dbPath + "-wal", { force: true });
  rmSync(dbPath + "-shm", { force: true });
  return before;
}

export function deleteBackup(dir: string, file: string) {
  if (!NAME.test(file) || !existsSync(join(dir, file))) return false;
  rmSync(join(dir, file));
  return true;
}

/** Scheduled sessions: for every configured time of day (WIB) that has passed and has no copy yet, write one; then keep the newest `keep` scheduled copies. Returns the files written. */
export async function runBackup(db: Db, dir: string, now = Date.now()) {
  const s = getBackupSettings(db);
  if (!s.enabled) return [];
  const w = wib(now), minutes = w.hour * 60 + w.minute, made: string[] = [];
  mkdirSync(dir, { recursive: true });
  for (const t of s.times) {
    const [h, m] = t.split(":").map(Number) as [number, number];
    const file = join(dir, `auto-${w.date}-${t.replace(":", "")}.db`);
    if (h * 60 + m > minutes || existsSync(file)) continue;
    await db.sqlite.backup(file);
    made.push(file);
  }
  const auto = readdirSync(dir).filter(f => NAME.test(f) && kindOf(f) === "auto").sort().reverse();
  for (const old of auto.slice(s.keep)) rmSync(join(dir, old), { force: true });
  return made;
}

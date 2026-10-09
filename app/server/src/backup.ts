import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { wib } from "@shared/time";
import type { Db } from "./db/index.js";

const KEEP = 14;
const NAME = /^app-\d{4}-\d{2}-\d{2}\.db$/;

/** One consistent copy of the database per WIB day (SQLite online backup, safe while the app runs); keeps the newest 14. Returns the new file, or null if today's already exists. */
export async function runBackup(db: Db, dir: string, now = Date.now()) {
  const file = join(dir, `app-${wib(now).date}.db`);
  if (existsSync(file)) return null;
  mkdirSync(dir, { recursive: true });
  await db.sqlite.backup(file);
  for (const old of readdirSync(dir).filter(f => NAME.test(f)).sort().reverse().slice(KEEP)) rmSync(join(dir, old), { force: true });
  return file;
}

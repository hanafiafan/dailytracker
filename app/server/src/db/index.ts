import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
// src/db -> ../../drizzle (dev); dist -> ../drizzle (bundled)
const migrationsDir = [join(here, "../../drizzle"), join(here, "../drizzle")].find(existsSync)!;

/** Opens (and migrates) the database. `path` may be ":memory:" for tests. */
export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return Object.assign(db, { sqlite });
}
export type Db = ReturnType<typeof openDb>;
export { schema };

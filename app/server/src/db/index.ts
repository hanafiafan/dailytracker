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
  try {
    sqlite.prepare("UPDATE members SET role = 'BO', level = 'Director' WHERE lower(name) = 'hanief' AND role != 'BO'").run();
    sqlite.prepare("UPDATE members SET role = 'Direktur', level = 'Director' WHERE lower(name) = 'aziz' AND role != 'Direktur'").run();
    sqlite.prepare("UPDATE members SET manager_email = (SELECT email FROM members WHERE lower(name) = 'hanief' LIMIT 1) WHERE lower(name) = 'aziz' AND (manager_email IS NULL OR manager_email = '')").run();
    sqlite.prepare("UPDATE members SET role = 'Project Manager', level = 'Project Manager', can_create_project = 1 WHERE lower(name) LIKE '%vero%' AND (role = '' OR role = 'Staff' OR level = 'Staff')").run();

    const entCount = (sqlite.prepare("SELECT count(*) as c FROM entities").get() as { c: number })?.c ?? 0;
    if (entCount === 0) {
      const distinctGroups = sqlite.prepare("SELECT DISTINCT grp FROM members WHERE grp IS NOT NULL AND grp != ''").all() as { grp: string }[];
      const now = Date.now();
      const insert = sqlite.prepare("INSERT OR IGNORE INTO entities (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)");
      const defaultUnits = ["HCS", "HCM", "HUC"];
      const allToSeed = Array.from(new Set([...defaultUnits, ...distinctGroups.map(g => g.grp.toUpperCase())]));
      const colors = ["lilac", "pink", "sky", "mint", "yellow", "lime", "peach"];
      allToSeed.forEach((u, i) => {
        insert.run(u, u, `Unit Bisnis & Entitas ${u}`, colors[i % colors.length]!, now);
      });
    }

    try { sqlite.prepare("ALTER TABLE chat_groups ADD COLUMN description text DEFAULT '' NOT NULL").run(); } catch {}
    try { sqlite.prepare("ALTER TABLE chat_groups ADD COLUMN photo blob").run(); } catch {}
    try { sqlite.prepare("ALTER TABLE chat_groups ADD COLUMN photo_v integer DEFAULT 0 NOT NULL").run(); } catch {}

    try { sqlite.prepare("ALTER TABLE messages ADD COLUMN is_pinned integer DEFAULT 0 NOT NULL").run(); } catch {}
    try { sqlite.prepare("ALTER TABLE messages ADD COLUMN pinned_at integer").run(); } catch {}
    try { sqlite.prepare("ALTER TABLE messages ADD COLUMN pinned_by text").run(); } catch {}
    try { sqlite.prepare("ALTER TABLE tasks ADD COLUMN revision_note text").run(); } catch {}
    try {
      sqlite.prepare(`CREATE TABLE IF NOT EXISTS chat_polls (
        id text PRIMARY KEY NOT NULL,
        message_id text NOT NULL REFERENCES messages(id) ON DELETE cascade,
        channel text NOT NULL,
        creator_email text NOT NULL,
        question text NOT NULL,
        options text NOT NULL,
        allow_multiple integer DEFAULT 0 NOT NULL,
        is_closed integer DEFAULT 0 NOT NULL,
        created_at integer NOT NULL
      )`).run();
    } catch {}
    try {
      sqlite.prepare(`CREATE TABLE IF NOT EXISTS chat_poll_votes (
        id text PRIMARY KEY NOT NULL,
        poll_id text NOT NULL REFERENCES chat_polls(id) ON DELETE cascade,
        email text NOT NULL,
        option_index integer NOT NULL,
        created_at integer NOT NULL
      )`).run();
    } catch {}
  } catch {}
  return Object.assign(db, { sqlite });
}
export type Db = ReturnType<typeof openDb>;
export { schema };

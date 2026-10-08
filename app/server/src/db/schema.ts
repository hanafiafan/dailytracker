import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  group: text("grp").notNull().default(""),
  isAdmin: bool("is_admin").notNull().default(false),
  adminGroups: text("admin_groups", { mode: "json" }).$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(999),
  photo: blob("photo", { mode: "buffer" }),
  photoV: integer("photo_v").notNull().default(0),
  seenAt: integer("seen_at"),
  askAt: integer("ask_at"),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => members.email, { onDelete: "cascade", onUpdate: "cascade" }),
  date: text("date").notNull(),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  start: text("start"),
  due: text("due"),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  hot: bool("hot").notNull().default(false),
  needProof: bool("need_proof").notNull().default(true),
  by: text("by", { enum: ["owner", "self"] }).notNull().default("owner"),
  fromAdmin: text("from_admin"),
  routineId: text("routine_id"),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  doneAt: integer("done_at"),
  returnedAt: integer("returned_at"),
  proofLink: text("proof_link"),
  proofAt: integer("proof_at"),
  hasPhoto: bool("has_photo").notNull().default(false),
  report: text("report"),
  reportAt: integer("report_at"),
  remDue: bool("rem_due").notNull().default(false),
  remLate: bool("rem_late").notNull().default(false),
}, t => [index("tasks_email_date").on(t.email, t.date), index("tasks_date").on(t.date)]);

export const proofs = sqliteTable("proofs", {
  taskId: text("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }),
  data: blob("data", { mode: "buffer" }).notNull(),
  at: integer("at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  by: text("by").notNull(),
  byEmail: text("by_email").notNull().default(""),
  text: text("text").notNull(),
  at: integer("at").notNull(),
}, t => [index("comments_task").on(t.taskId)]);

export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  email: text("email").notNull().references(() => members.email, { onDelete: "cascade", onUpdate: "cascade" }),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  start: text("start"),
  due: text("due"),
  days: text("days", { mode: "json" }).$type<number[]>().notNull(),
  hot: bool("hot").notNull().default(false),
  needProof: bool("need_proof").notNull().default(true),
  byName: text("by_name"),
});

export const links = sqliteTable("links", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  exp: integer("exp").notNull(),
});

export const pushSubs = sqliteTable("push_subs", {
  endpoint: text("endpoint").primaryKey(),
  email: text("email").notNull(),
  sub: text("sub", { mode: "json" }).$type<{ endpoint: string; keys: { p256dh: string; auth: string } }>().notNull(),
}, t => [index("push_email").on(t.email)]);

export const meta = sqliteTable("meta", { k: text("k").primaryKey(), v: text("v").notNull() });

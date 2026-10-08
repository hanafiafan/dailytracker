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


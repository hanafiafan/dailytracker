import { getTableColumns } from "drizzle-orm";
import type { Policy } from "@shared/policy";
import type { Db } from "./db/index.js";
import { members } from "./db/schema.js";
import type { Env } from "./env.js";
import type { Bus } from "./events.js";
import type { Push } from "./push.js";

export interface GoogleIdentity { email: string; name: string; verified: boolean }
export interface Deps {
  db: Db; env: Env; push: Push; bus: Bus;
  /** Checks a Google ID token; injected so tests need no network. */
  verifyGoogle: (credential: string) => Promise<GoogleIdentity>;
}
export type MemberRow = Omit<typeof members.$inferSelect, "photo">;
export interface User { email: string; name: string; owner: boolean; member: MemberRow | null; policy: Policy }
export type AppEnv = { Variables: { user: User } };

const { photo: _photo, ...memberCols } = getTableColumns(members);
/** Member columns without the (large) photo bytes. */
export const memberColumns = memberCols;
export const loadTeam = (db: Db): MemberRow[] => db.select(memberColumns).from(members).all();

export const newId = (bytes = 8) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join("");

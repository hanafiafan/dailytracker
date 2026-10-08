import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { makePolicy } from "@shared/policy";
import { sessions } from "./db/schema.js";
import { loadTeam, newId, type AppEnv, type Deps } from "./context.js";

const COOKIE = "th_session";
const DAYS = 30;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export function startSession(c: Parameters<typeof setCookie>[0], { db, env }: Deps, email: string, name: string) {
  const token = newId(32);
  db.delete(sessions).where(lt(sessions.exp, Date.now())).run();
  db.insert(sessions).values({ tokenHash: hash(token), email, name, exp: Date.now() + DAYS * 864e5 }).run();
  setCookie(c, COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: env.PUBLIC_URL.startsWith("https:"), maxAge: DAYS * 86400 });
}
export function endSession(c: Parameters<typeof getCookie>[0], { db }: Deps) {
  const token = getCookie(c, COOKIE);
  if (token) db.delete(sessions).where(eq(sessions.tokenHash, hash(token))).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Resolves the session cookie into the signed-in user and their permissions, or answers 401. */
export const requireUser = (deps: Deps) => createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE);
  const s = token ? deps.db.select().from(sessions).where(eq(sessions.tokenHash, hash(token))).get() : undefined;
  if (!s || s.exp < Date.now()) return c.json({ error: "unauthorized" }, 401);
  const team = loadTeam(deps.db);
  const owner = s.email === deps.env.OWNER_EMAIL;
  c.set("user", { email: s.email, name: s.name, owner, member: team.find(m => m.email === s.email) ?? null, policy: makePolicy(s.email, owner, team) });
  await next();
});

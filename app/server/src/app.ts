import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSub } from "@shared/schemas";
import { wib } from "@shared/time";
import { members, pushSubs } from "./db/schema.js";
import { toMemberLite } from "./dto.js";
import { endSession, requireUser, startSession } from "./auth.js";
import { createNotify } from "./notify.js";
import { memberColumns, type AppEnv, type Deps } from "./context.js";
import { linkRoutes } from "./routes/links.js";
import { routineRoutes } from "./routes/routines.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/team.js";

export function createApp(deps: Deps) {
  const { db, env, push, bus } = deps;
  const nameOf = (email: string) => db.select({ n: members.name }).from(members).where(eq(members.email, email)).get()?.n ?? email;
  const notify = createNotify(push, nameOf);
  const auth = requireUser(deps);

  const api = new Hono<AppEnv>()
    // Every write must carry this header: cross-site forms and images cannot add it.
    .use(async (c, next) => c.req.method !== "GET" && c.req.header("x-app") !== "1" ? c.json({ error: "bad request" }, 400) : next())
    .get("/config", c => c.json({ googleClientId: env.GOOGLE_CLIENT_ID, vapidPublicKey: push.publicKey }))
    .post("/auth/google", zValidator("json", z.object({ credential: z.string().min(10) })), async c => {
      try {
        const id = await deps.verifyGoogle(c.req.valid("json").credential);
        if (!id.verified) return c.json({ error: "Email Google belum terverifikasi" }, 403);
        startSession(c, deps, id.email, id.name);
        return c.json({ ok: true });
      } catch (e) { console.warn("login", (e as Error).message); return c.json({ error: "Login Google ditolak" }, 401); }
    })
    .post("/auth/logout", c => { endSession(c, deps); return c.json({ ok: true }); })

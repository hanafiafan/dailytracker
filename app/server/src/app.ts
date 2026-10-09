import { createHash } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSub } from "@shared/schemas";
import { wib } from "@shared/time";
import { members, pushSubs } from "./db/schema.js";
import { toMemberLite } from "./dto.js";
import { endSession, requireTeam, requireUser, startSession } from "./auth.js";
import { createNotify } from "./notify.js";
import { memberColumns, type AppEnv, type Deps } from "./context.js";
import { inboxRoutes } from "./routes/inbox.js";
import { leaveRoutes } from "./routes/leaves.js";
import { timeRoutes } from "./routes/time.js";
import { bookingRoutes, resourceRoutes } from "./routes/resources.js";
import { linkRoutes } from "./routes/links.js";
import { metaRoutes } from "./routes/meta.js";
import { reportRoutes } from "./routes/reports.js";
import { routineRoutes } from "./routes/routines.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/team.js";

export function createApp(deps: Deps) {
  const { db, env, push, bus } = deps;
  const nameOf = (email: string) => db.select({ n: members.name }).from(members).where(eq(members.email, email)).get()?.n ?? email;
  const notify = createNotify(push, db, bus, nameOf);
  const auth = requireUser(deps), team = requireTeam;
  const deviceId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 12);
  const lastTest = new Map<string, number>();

  const api = new Hono<AppEnv>()
    // No request needs more than a compressed photo (about 1.5 MB); anything bigger is refused before it is read into memory.
    .use(bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ error: "Berkas terlalu besar" }, 413) }))
    // Every write must carry this header: cross-site forms and images cannot add it.
    .use(async (c, next) => c.req.method !== "GET" && c.req.header("x-app") !== "1" ? c.json({ error: "bad request" }, 400) : next())
    .get("/config", c => c.json({ googleClientId: env.GOOGLE_CLIENT_ID, vapidPublicKey: push.publicKey }))
    .post("/auth/google", zValidator("json", z.object({ credential: z.string().min(10) })), async c => {
      try {
        const id = await deps.verifyGoogle(c.req.valid("json").credential);
        if (!id.verified) return c.json({ error: "Email Google belum terverifikasi" }, 403);
        startSession(c, deps, id.email.toLowerCase(), id.name);
        return c.json({ ok: true });
      } catch (e) { console.warn("login", (e as Error).message); return c.json({ error: "Login Google ditolak" }, 401); }
    })
    // Local preview only: sign in as any registered email without Google. Refused unless explicitly enabled AND served from localhost.
    .post("/auth/dev", zValidator("json", z.object({ email: z.string().email() })), c => {
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.PUBLIC_URL);
      if (!env.ALLOW_DEV_LOGIN || !local) return c.json({ error: "not found" }, 404);
      startSession(c, deps, c.req.valid("json").email.toLowerCase(), "Dev");
      return c.json({ ok: true });
    })
    // Same, as a link you can open in the browser: /api/auth/dev?email=owner@demo.id
    .get("/auth/dev", c => {
      const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.PUBLIC_URL);
      const email = c.req.query("email")?.toLowerCase();
      if (!env.ALLOW_DEV_LOGIN || !local || !email) return c.json({ error: "not found" }, 404);
      startSession(c, deps, email, "Dev");
      return c.redirect("/");
    })
    .post("/auth/logout", c => { endSession(c, deps); return c.json({ ok: true }); })
    .get("/me", auth, c => {
      const u = c.var.user;
      // Remember (once a day) that this person has opened the app, so the owner sees who has signed in.
      const m = u.member;
      if (m && (!m.seenAt || wib(m.seenAt).date !== wib().date)) {
        db.update(members).set({ seenAt: Date.now() }).where(eq(members.email, u.email)).run();
        bus.emit("team");
      }
      return c.json({ email: u.email, name: m?.name ?? u.name, owner: u.owner, member: m ? toMemberLite(m) : null });
    })
    .use("/team/*", auth, team).route("/team", teamRoutes(deps))
    .use("/tasks/*", auth, team).route("/tasks", taskRoutes(deps, notify))
    .use("/routines/*", auth, team).route("/routines", routineRoutes(deps))
    .use("/leaves/*", auth, team).route("/leaves", leaveRoutes(deps, notify))
    .use("/time/*", auth, team).route("/time", timeRoutes(deps))
    .use("/resources/*", auth, team).route("/resources", resourceRoutes(deps))
    .use("/bookings/*", auth, team).route("/bookings", bookingRoutes(deps))
    .use("/links/*", auth, team).route("/links", linkRoutes(deps))
    .use("/meta/*", auth, team).route("/meta", metaRoutes(deps))
    .use("/inbox/*", auth, team).route("/inbox", inboxRoutes(deps))
    .use("/reports/*", auth, team).route("/reports", reportRoutes(deps))
    // "I have nothing left to do": tells the admins.
    .post("/ask", auth, team, c => {
      const u = c.var.user;
      if (!u.member) return c.json({ error: "forbidden" }, 403);
      db.update(members).set({ askAt: Date.now() }).where(eq(members.email, u.email)).run();
      bus.emit("team");
      void notify.ask(u.email);
      return c.json({ ok: true });
    })
    .post("/push/subscribe", auth, team, zValidator("json", pushSub), c => {
      const sub = c.req.valid("json");
      db.insert(pushSubs).values({ endpoint: sub.endpoint, email: c.var.user.email, sub }).onConflictDoUpdate({ target: pushSubs.endpoint, set: { email: c.var.user.email, sub } }).run();
      return c.json({ ok: true });
    })
    // This person's own devices (never the endpoint itself, only a short id and which service delivers to it).
    .get("/push/devices", auth, team, c => c.json(db.select().from(pushSubs).where(eq(pushSubs.email, c.var.user.email)).all().map(r => ({ id: deviceId(r.endpoint), service: new URL(r.endpoint).hostname }))))
    .delete("/push/devices/:id", auth, team, c => {
      for (const r of db.select().from(pushSubs).where(eq(pushSubs.email, c.var.user.email)).all()) if (deviceId(r.endpoint) === c.req.param("id")) db.delete(pushSubs).where(eq(pushSubs.endpoint, r.endpoint)).run();
      return c.json({ ok: true });
    })
    // A test message to all of my devices, at most once every 10 seconds.
    .post("/push/test", auth, team, async c => {
      const me = c.var.user.email, now = Date.now();
      if (now - (lastTest.get(me) ?? 0) < 10_000) return c.json({ error: "Tunggu beberapa detik sebelum mengirim lagi." }, 429);
      lastTest.set(me, now);
      const r = (await push.send([me], "Notifikasi uji", "Kalau pesan ini muncul, notifikasi di perangkatmu sudah berfungsi.", "test-" + now)) ?? { sent: 0, failed: 0 };
      return c.json(r);
    })
    .post("/push/unsubscribe", auth, zValidator("json", z.object({ endpoint: z.string() })), c => {
      db.delete(pushSubs).where(and(eq(pushSubs.endpoint, c.req.valid("json").endpoint), eq(pushSubs.email, c.var.user.email))).run();
      return c.json({ ok: true });
    })
    // Server-sent events: only "something changed" signals; the browser refetches what it is allowed to see.
    .get("/events", auth, team, c => streamSSE(c, async stream => {
      const off = bus.subscribe(topic => { void stream.writeSSE({ event: "change", data: topic }); });
      stream.onAbort(off);
      await stream.writeSSE({ event: "ready", data: "" });
      while (!stream.aborted) { await stream.sleep(25_000); await stream.writeSSE({ event: "ping", data: "" }); }
    }));

  return new Hono()
    // Browser hardening: only our own scripts plus Google Sign-In may run, nobody may frame the app, HTTPS is remembered.
    .use(secureHeaders({
      strictTransportSecurity: env.PUBLIC_URL.startsWith("https:") ? "max-age=31536000" : false,
      xFrameOptions: "DENY", referrerPolicy: "same-origin",
      // Google Sign-In opens a popup that talks back to this page: "same-origin" would cut that link and leave the popup blank.
      crossOriginOpenerPolicy: "same-origin-allow-popups",
      permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
      contentSecurityPolicy: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'", "https://accounts.google.com/gsi/client"], styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
        connectSrc: ["'self'", "https://accounts.google.com/gsi/"], frameSrc: ["https://accounts.google.com/gsi/"], imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"], workerSrc: ["'self'"], manifestSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
      },
    }))
    .route("/api", api);
}
export type AppType = ReturnType<typeof createApp>;

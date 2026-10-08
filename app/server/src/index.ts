// Tugas Harian server: JSON API + live updates + Web Push + the built web app, in one process.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OAuth2Client } from "google-auth-library";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createApp } from "./app.js";
import { openDb } from "./db/index.js";
import { readEnv } from "./env.js";
import { createBus } from "./events.js";
import { startJobs } from "./jobs.js";
import { createPush } from "./push.js";

const env = readEnv();
const db = openDb(join(env.DATA_DIR, "app.db"));
const bus = createBus();
const push = createPush(db, env.OWNER_EMAIL, env.PUBLIC_URL);
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const api = createApp({
  db, env, push, bus,
  verifyGoogle: async credential => {
    const p = (await google.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })).getPayload();
    if (!p?.email) throw new Error("no email in token");
    return { email: p.email.toLowerCase(), name: p.name ?? p.email, verified: !!p.email_verified };
  },
});

// API first, then the built web app with a fallback to index.html for client-side routes.
const web = resolve(env.WEB_DIR);
const app = api;
if (existsSync(web)) {
  const index = readFileSync(join(web, "index.html"), "utf8");
  app.use("/*", serveStatic({
    root: web,
    onFound: (path, c) => { c.header("cache-control", /\/assets\//.test(path) ? "public, max-age=31536000, immutable" : "no-cache"); },
  }));
  app.get("*", c => c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(index, 200, { "cache-control": "no-cache" }));
}

startJobs(db, push, bus);
serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, i => console.log(`Tugas Harian listening on ${i.address}:${i.port}`));

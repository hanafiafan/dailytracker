// Tugas Harian server: static app + JSON API + live updates (SSE) + Web Push, all in one process.
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { openStore } from "./store.js";
import { makeRules } from "./rules.js";
import { makePush, onWrite } from "./push.js";
import { startScheduler, wib } from "./reminders.js";

const env = process.env;
for (const k of ["GOOGLE_CLIENT_ID", "OWNER_EMAIL", "PUBLIC_URL"]) if (!env[k]) { console.error(`Missing env ${k} (see deploy/README.md)`); process.exit(1); }
const OWNER = env.OWNER_EMAIL.toLowerCase();
const store = openStore(env.DATA_DIR || "./data");
const rules = makeRules(store, OWNER);
const push = makePush(store, OWNER, env.PUBLIC_URL);
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { res.set({ "x-content-type-options": "nosniff", "referrer-policy": "same-origin" }); next(); });

// ---------- auth ----------
const COOKIE = "th_session";
const cookie = (req, name) => ((req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(name + "=")) || "").slice(name.length + 1);
const setCookie = (req, res, value, maxAge) => res.append("set-cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? "; Secure" : ""}`);
const auth = (req, res, next) => {
  req.me = store.session.who(cookie(req, COOKIE));
  if (!req.me) return res.status(401).json({ error: "unauthorized" });
  req.rules = rules(req.me);
  next();
};
// CSRF: every write must carry a custom header, which cross-site pages cannot send without a CORS preflight (we allow none).
app.use("/api", (req, res, next) => (req.method !== "GET" && req.get("x-app") !== "1") ? res.status(400).json({ error: "bad request" }) : next());

app.get("/api/config", (_req, res) => res.json({ googleClientId: env.GOOGLE_CLIENT_ID, vapidPublicKey: push.publicKey }));
app.post("/api/auth/google", async (req, res) => {
  try {
    const t = await google.verifyIdToken({ idToken: String(req.body.credential || ""), audience: env.GOOGLE_CLIENT_ID });
    const p = t.getPayload();
    if (!p.email || !p.email_verified) return res.status(403).json({ error: "email not verified" });
    const email = p.email.toLowerCase();
    setCookie(req, res, store.session.make(email), 30 * 86400);
    res.json({ email, owner: email === OWNER });
  } catch (e) { console.warn("login", e.message); res.status(401).json({ error: "invalid credential" }); }
});
app.post("/api/auth/logout", (req, res) => { store.session.end(cookie(req, COOKIE)); setCookie(req, res, "", 0); res.json({}); });
app.get("/api/me", auth, (req, res) => res.json({ email: req.me, owner: req.rules.owner }));


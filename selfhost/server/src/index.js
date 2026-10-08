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

// ---------- live updates (SSE): the client re-reads whatever changed ----------
const clients = new Set();
function emit(path) {
  const msg = `data: ${JSON.stringify({ path })}\n\n`;
  for (const c of clients) if (rules(c.email).can("get", path)) c.res.write(msg);
}
app.get("/api/events", auth, (req, res) => {
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" }).flushHeaders();
  res.write("retry: 3000\n\n");
  const c = { email: req.me, res };
  clients.add(c);
  const ka = setInterval(() => res.write(": ka\n\n"), 25000);
  req.on("close", () => { clearInterval(ka); clients.delete(c); });
});

// ---------- documents ----------
const segs = p => typeof p === "string" && p.length < 900 ? p.split("/") : null;
const okPath = (p, odd) => { const s = segs(p); return !!s && s.length <= 4 && s.length % 2 === (odd ? 1 : 0) && s.every(x => x && x !== "." && x !== ".."); };
const docOut = (path, d) => ({ id: path.split("/").pop(), exists: !!d, data: d ? d.data : null });

app.get("/api/doc", auth, (req, res) => {
  const path = String(req.query.path || "");
  if (!okPath(path, false)) return res.status(400).json({ error: "bad path" });
  if (!req.rules.can("get", path)) return res.status(403).json({ error: "permission-denied" });
  res.json(docOut(path, store.get(path)));
});
app.get("/api/col", auth, (req, res) => {
  const path = String(req.query.path || "");
  if (!okPath(path, true)) return res.status(400).json({ error: "bad path" });
  if (!req.rules.can("list", path)) return res.status(403).json({ error: "permission-denied" });
  let where = [];
  try { where = req.query.where ? JSON.parse(req.query.where) : []; res.json({ docs: store.list(path, where) }); }
  catch { res.status(400).json({ error: "bad query" }); }
});

function write(req, res, path, op, data, merge, extra = {}) {
  if (!okPath(path, false)) return res.status(400).json({ error: "bad path" });
  const before = (store.get(path) || {}).data || null;
  let after = null;
  if (op === "update" && !before) return res.status(404).json({ error: "not-found" });
  if (op !== "delete") {
    if (!data || typeof data !== "object" || Array.isArray(data)) return res.status(400).json({ error: "bad data" });
    after = op === "update" || (op === "set" && merge) ? { ...(before || {}), ...data } : data;
  }
  const action = op === "delete" ? "delete" : before ? "update" : "create";
  if (op === "delete" && !before) return res.json({});
  if (!req.rules.can(action, path, before, after)) return res.status(403).json({ error: "permission-denied" });
  if (op === "delete") store.del(path); else store.set(path, after);
  emit(path);
  try { onWrite(push, () => wib().date, path, before, after); } catch (e) { console.warn("hook", e); }
  res.json(extra);
}
app.put("/api/doc", auth, (req, res) => write(req, res, String(req.query.path || ""), "set", req.body.data, !!req.body.merge));
app.patch("/api/doc", auth, (req, res) => write(req, res, String(req.query.path || ""), "update", req.body.data));
app.delete("/api/doc", auth, (req, res) => write(req, res, String(req.query.path || ""), "delete"));
app.post("/api/col", auth, (req, res) => {
  const col = String(req.query.path || ""), id = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  if (!okPath(col, true)) return res.status(400).json({ error: "bad path" });
  write(req, res, `${col}/${id}`, "set", req.body.data, false, { id });
});

// ---------- push subscriptions ----------
app.post("/api/push/subscribe", auth, (req, res) => {
  const sub = req.body.sub;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return res.status(400).json({ error: "bad subscription" });
  store.push.save(sub.endpoint, req.me, sub);
  res.json({});
});
app.post("/api/push/unsubscribe", auth, (req, res) => { store.push.drop(String(req.body.endpoint || "")); res.json({}); });


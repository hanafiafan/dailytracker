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


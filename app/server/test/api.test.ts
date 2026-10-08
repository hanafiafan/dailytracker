import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db/index.js";
import { createBus } from "../src/events.js";
import { createPush } from "../src/push.js";
import { ensureRoutines, runReminders } from "../src/jobs.js";
import { members, sessions, tasks } from "../src/db/schema.js";
import { wib } from "@shared/time";
import { createHash } from "node:crypto";

const OWNER = "owner@x.id";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function setup() {
  const db = openDb(":memory:");
  const env = { GOOGLE_CLIENT_ID: "cid", OWNER_EMAIL: OWNER, PUBLIC_URL: "http://localhost/", DATA_DIR: "", PORT: 0, HOST: "", WEB_DIR: "" };
  const bus = createBus();
  const push = createPush(db, OWNER, env.PUBLIC_URL);
  const sent: { to: string[]; title: string }[] = [];
  vi.spyOn(push, "send").mockImplementation(async (to, title) => { sent.push({ to: [...to], title }); });
  const app = createApp({ db, env, push, bus, verifyGoogle: async cred => ({ email: cred.split(":")[1]!, name: "N", verified: true }) });
  const login = (email: string) => {
    db.insert(sessions).values({ tokenHash: createHash("sha256").update("tok-" + email).digest("hex"), email, name: email, exp: Date.now() + 1e7 }).onConflictDoNothing().run();
    return { cookie: "th_session=tok-" + email };
  };
  const call = (as: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => app.request("/api" + path, {
    method, headers: { "x-app": "1", ...(as ? login(as) : {}), ...(body !== undefined && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), ...extra },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  db.insert(members).values([
    { email: "vero@x.id", name: "Vero", isAdmin: true, sortOrder: 1 },
    { email: "hcs@x.id", name: "Hcs", group: "HCS", isAdmin: true, adminGroups: ["HCS"], sortOrder: 2 },
    { email: "a@x.id", name: "A", group: "HCS", sortOrder: 3 },
    { email: "b@x.id", name: "B", group: "ADS", sortOrder: 4 },
  ]).run();
  return { db, call, sent, push };
}

describe("api", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it("rejects anonymous requests and writes without the x-app header", async () => {
    expect((await t.call(null, "GET", "/tasks")).status).toBe(401);
    expect((await t.call("a@x.id", "POST", "/ask", undefined, { "x-app": "0" })).status).toBe(400);
  });

  it("logs in through Google and sets an httpOnly cookie", async () => {
    const r = await t.call(null, "POST", "/auth/google", { credential: "google:a@x.id" });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/th_session=.*HttpOnly/i);
  });


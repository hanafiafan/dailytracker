import { beforeEach, describe, expect, it } from "vitest";
import { activity, notifications, tasks } from "../src/db/schema.js";
import { wib } from "@shared/time";
import { OWNER, setup } from "./helpers.js";

type J = Record<string, any>;
const json = async (r: Response) => (await r.json()) as J;

describe("projects, labels, priority", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it("only managers manage projects and labels; everyone reads them", async () => {
    expect((await t.call("a@x.id", "POST", "/meta/projects", { name: "Lebaran" })).status).toBe(403);
    const p = await json(await t.call("hcs@x.id", "POST", "/meta/projects", { name: "Lebaran", color: "pink" }));
    const l = await json(await t.call(OWNER, "POST", "/meta/labels", { name: "Foto", color: "sky" }));
    const meta = await json(await t.call("a@x.id", "GET", "/meta"));
    expect(meta.projects[0]).toMatchObject({ id: p.id, name: "Lebaran", color: "pink" });
    expect(meta.labels[0]).toMatchObject({ id: l.id, name: "Foto" });
    expect((await t.call("hcs@x.id", "DELETE", `/meta/projects/${p.id}`)).status).toBe(403); // only a boss deletes
    expect((await t.call(OWNER, "DELETE", `/meta/projects/${p.id}`)).status).toBe(200);
  });

  it("creates a task with project, labels, priority, and subtasks", async () => {
    const p = await json(await t.call(OWNER, "POST", "/meta/projects", { name: "Ramadhan" }));
    const l = await json(await t.call(OWNER, "POST", "/meta/labels", { name: "Video" }));
    const r = await json(await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "Edit reels", priority: "urgent", projectId: p.id, labelIds: [l.id], subtasks: ["Cut", "Warna"] }));
    const [task] = await json(await t.call("a@x.id", "GET", "/tasks?from=2000-01-01")) as unknown as J[];
    expect(task).toMatchObject({ id: r.ids[0], priority: "urgent", hot: true, projectId: p.id, labelIds: [l.id] });
    expect(task!.subtasks.map((s: J) => s.title)).toEqual(["Cut", "Warna"]);
    expect((await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "x", projectId: "nope" })).status).toBe(404);
  });
});

describe("editing tasks", () => {
  let t: ReturnType<typeof setup>;
  let id: string;
  beforeEach(async () => { t = setup(); id = (await json(await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T" }))).ids[0]; });

  it("a manager reschedules, changes priority, and logs it on the timeline", async () => {
    expect((await t.call("hcs@x.id", "PATCH", `/tasks/${id}`, { date: "2026-12-01", start: "09:00", due: "11:00", priority: "high" })).status).toBe(200);
    expect(t.db.select().from(tasks).get()).toMatchObject({ date: "2026-12-01", start: "09:00", due: "11:00", priority: "high", hot: true });
    const tl = await json(await t.call("a@x.id", "GET", `/tasks/${id}/activity`)) as unknown as J[];
    expect(tl.map(x => x.kind)).toEqual(["created", "edited"]);
    expect(tl[1]!.text).toContain("jadwal");
  });
  it("rejects a due time before the start time", async () => {
    expect((await t.call(OWNER, "PATCH", `/tasks/${id}`, { start: "10:00", due: "09:00" })).status).toBe(400);
  });
  it("a member cannot edit an assigned task but can edit their own", async () => {
    expect((await t.call("a@x.id", "PATCH", `/tasks/${id}`, { title: "hack" })).status).toBe(403);
    const own = (await json(await t.call("a@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Punyaku" }))).ids[0];
    expect((await t.call("a@x.id", "PATCH", `/tasks/${own}`, { title: "Punyaku v2", due: "15:00" })).status).toBe(200);
    expect((await t.call("a@x.id", "PATCH", `/tasks/${own}`, { email: "b@x.id" })).status).toBe(403);
  });
  it("reassigns to someone the manager controls and notifies them", async () => {
    expect((await t.call("hcs@x.id", "PATCH", `/tasks/${id}`, { email: "b@x.id" })).status).toBe(403); // ADS is outside HCS
    expect((await t.call(OWNER, "PATCH", `/tasks/${id}`, { email: "b@x.id" })).status).toBe(200);
    expect(t.db.select().from(tasks).get()!.email).toBe("b@x.id");
    expect(t.db.select().from(notifications).all().some(n => n.email === "b@x.id" && n.kind === "assigned")).toBe(true);
  });
  it("subtasks can be added and checked by the assignee, not by strangers", async () => {
    const s = await json(await t.call("a@x.id", "POST", `/tasks/${id}/subtasks`, { title: "Langkah 1" }));
    expect((await t.call("b@x.id", "PATCH", `/tasks/${id}/subtasks/${s.id}`, { done: true })).status).toBe(404);
    expect((await t.call("a@x.id", "PATCH", `/tasks/${id}/subtasks/${s.id}`, { done: true })).status).toBe(200);
    const [task] = await json(await t.call("a@x.id", "GET", "/tasks?from=2000-01-01")) as unknown as J[];
    expect(task!.subtasks).toEqual([{ id: s.id, title: "Langkah 1", done: true }]);
    expect((await t.call("a@x.id", "DELETE", `/tasks/${id}/subtasks/${s.id}`)).status).toBe(200);
  });
});

describe("inbox and mentions", () => {
  let t: ReturnType<typeof setup>;
  let id: string;
  beforeEach(async () => { t = setup(); id = (await json(await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T" }))).ids[0]; });

  it("a new task lands in the assignee's bell and can be marked read", async () => {
    const inbox = await json(await t.call("a@x.id", "GET", "/inbox/notifications"));
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]).toMatchObject({ kind: "task_new", read: false, taskId: id });
    expect((await json(await t.call("b@x.id", "GET", "/inbox/notifications"))).items).toHaveLength(0); // private to each person
    await t.call("a@x.id", "POST", "/inbox/notifications/read", {});
    expect((await json(await t.call("a@x.id", "GET", "/inbox/notifications"))).unread).toBe(0);
  });
  it("@mention notifies the mentioned manager; strangers cannot be mentioned", async () => {
    await t.call("a@x.id", "POST", `/tasks/${id}/comments`, { text: "@Hcs tolong cek", mentions: ["hcs@x.id", "b@x.id"] });
    const hcs = await json(await t.call("hcs@x.id", "GET", "/inbox/notifications"));
    expect(hcs.items.some((n: J) => n.kind === "mention")).toBe(true);
    expect(t.db.select().from(notifications).all().some(n => n.email === "b@x.id")).toBe(false);
  });
  it("a manager's comment notifies the assignee", async () => {
    await t.call(OWNER, "POST", `/tasks/${id}/comments`, { text: "Mohon revisi" });
    const a = await json(await t.call("a@x.id", "GET", "/inbox/notifications"));
    expect(a.items.some((n: J) => n.kind === "comment")).toBe(true);
  });
  it("the activity feed only shows what the caller may see", async () => {
    await t.call(OWNER, "POST", "/tasks", { emails: ["b@x.id"], title: "Rahasia ADS" });
    const feed = (await json(await t.call("hcs@x.id", "GET", "/inbox/activity"))) as unknown as J[];
    expect(feed.every(f => f.taskTitle !== "Rahasia ADS")).toBe(true);
    expect(t.db.select().from(activity).all().length).toBeGreaterThanOrEqual(2);
  });
});

describe("reports", () => {
  it("summarises tasks per person and exports CSV for managers only", async () => {
    const t = setup(), today = wib().date;
    const mk = async (email: string, body: object) => (await json(await t.call(OWNER, "POST", "/tasks", { emails: [email], date: today, needProof: false, ...body }))).ids[0] as string;
    const a1 = await mk("a@x.id", { title: "Selesai", due: "23:59" });
    await mk("a@x.id", { title: "Belum" });
    await mk("b@x.id", { title: "ADS" });
    const fd = new FormData(); fd.set("skipProof", "1");
    await t.call("a@x.id", "POST", `/tasks/${a1}/complete`, fd);

    const own = await json(await t.call("a@x.id", "GET", "/reports/analytics"));
    expect(own.totals).toMatchObject({ total: 2, done: 1, open: 1 });
    expect(own.perPerson).toHaveLength(1);
    const all = await json(await t.call(OWNER, "GET", "/reports/analytics"));
    expect(all.totals.total).toBe(3);
    expect(all.perPerson.find((p: J) => p.email === "a@x.id")).toMatchObject({ total: 2, done: 1, onTime: 1 });
    expect(all.daily.at(-1)).toMatchObject({ date: today, created: 3, done: 1 });

    expect((await t.call("a@x.id", "GET", "/reports/tasks.csv")).status).toBe(403);
    const csv = await (await t.call(OWNER, "GET", "/reports/tasks.csv")).text();
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(csv).toContain("Selesai");
    expect(csv).toContain("tepat waktu");
  });
});

describe("dev login", () => {
  it("does not exist unless explicitly enabled", async () => {
    const t = setup();
    expect((await t.call(null, "POST", "/auth/dev", { email: "a@x.id" })).status).toBe(404);
  });
});

describe("nudge", () => {
  it("lets a manager remind the assignee once an hour, and nobody else", async () => {
    const t = setup();
    const made = await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Telat" }));
    const id = made.ids[0];
    expect((await t.call("a@x.id", "POST", `/tasks/${id}/nudge`)).status).toBe(403);
    expect((await t.call("b@x.id", "POST", `/tasks/${id}/nudge`)).status).toBe(403);
    expect((await t.call("hcs@x.id", "POST", `/tasks/${id}/nudge`)).status).toBe(200);
    expect(t.sent.some(s => s.to.includes("a@x.id") && s.title.includes("mengingatkan"))).toBe(true);
    expect((await t.call("hcs@x.id", "POST", `/tasks/${id}/nudge`)).status).toBe(429);
  });
});

describe("leave requests", () => {
  const day = (n: number) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
  it("a member asks, only their managers decide, overlaps and bad ranges are refused", async () => {
    const t = setup();
    const body = { kind: "cuti", from: day(2), to: day(4), reason: "Acara keluarga" };
    expect((await t.call(OWNER, "POST", "/leaves", body)).status).toBe(403); // owner is not a team member
    expect((await t.call("a@x.id", "POST", "/leaves", { ...body, to: day(1) })).status).toBe(400);
    expect((await t.call("a@x.id", "POST", "/leaves", { ...body, to: day(90) })).status).toBe(400);
    const made = await t.call("a@x.id", "POST", "/leaves", body);
    expect(made.status).toBe(201);
    const { id } = await json(made);
    expect(t.sent.some(s => s.title.includes("mengajukan cuti"))).toBe(true);
    expect((await t.call("a@x.id", "POST", "/leaves", { ...body, from: day(3), to: day(5) })).status).toBe(409);
    // visibility: the person, their unit admin and the owner; not another unit
    expect((await json(await t.call("a@x.id", "GET", "/leaves"))).length).toBe(1);
    expect((await json(await t.call("hcs@x.id", "GET", "/leaves"))).length).toBe(1);
    expect((await json(await t.call("b@x.id", "GET", "/leaves"))).length).toBe(0);
    // decisions: not the requester, not another unit's person, once only
    expect((await t.call("a@x.id", "PATCH", `/leaves/${id}/decision`, { status: "approved" })).status).toBe(403);
    expect((await t.call("b@x.id", "PATCH", `/leaves/${id}/decision`, { status: "approved" })).status).toBe(403);
    expect((await t.call("hcs@x.id", "PATCH", `/leaves/${id}/decision`, { status: "approved" })).status).toBe(200);
    expect(t.sent.some(s => s.to.includes("a@x.id") && s.title.includes("disetujui"))).toBe(true);
    expect((await t.call("hcs@x.id", "PATCH", `/leaves/${id}/decision`, { status: "rejected" })).status).toBe(409);
    expect((await json(await t.call("a@x.id", "GET", "/leaves")))[0].status).toBe("approved");
    // a rejected request frees the dates again; a pending one can be withdrawn by its owner
    const again = await json(await t.call("a@x.id", "POST", "/leaves", { ...body, from: day(10), to: day(10) }));
    expect((await t.call("b@x.id", "DELETE", `/leaves/${again.id}`)).status).toBe(403);
    expect((await t.call("a@x.id", "DELETE", `/leaves/${again.id}`)).status).toBe(200);
  });
});

describe("time tracking", () => {
  it("one running timer per person, totals per task, access follows task visibility", async () => {
    const t = setup();
    const mk = async (title: string) => (await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title }))).ids[0] as string;
    const t1 = await mk("Satu"), t2 = await mk("Dua");
    expect((await t.call("b@x.id", "POST", `/time/${t1}/start`)).status).toBe(403);
    expect((await t.call("a@x.id", "POST", `/time/${t1}/start`)).status).toBe(200);
    expect((await json(await t.call("a@x.id", "GET", "/tasks"))).find((x: J) => x.id === t1).status).toBe("doing");
    expect((await json(await t.call("a@x.id", "GET", "/time/running"))).taskTitle).toBe("Satu");
    await t.call("a@x.id", "POST", `/time/${t2}/start`); // starting another stops the first
    expect((await json(await t.call("a@x.id", "GET", "/time/running"))).taskTitle).toBe("Dua");
    expect((await json(await t.call("a@x.id", "GET", `/time/task/${t1}`))).entries[0].endedAt).not.toBeNull();
    expect((await t.call("b@x.id", "GET", `/time/task/${t1}`)).status).toBe(404);
    await t.call("a@x.id", "POST", "/time/stop");
    expect(await json(await t.call("a@x.id", "GET", "/time/running"))).toBeNull();
    const rep = await json(await t.call("hcs@x.id", "GET", "/time/report"));
    expect(rep.perPerson[0].email).toBe("a@x.id");
    expect((await json(await t.call("b@x.id", "GET", "/time/report"))).perPerson).toHaveLength(0);
    const e = (await json(await t.call("a@x.id", "GET", `/time/task/${t1}`))).entries[0];
    expect((await t.call("b@x.id", "DELETE", `/time/entry/${e.id}`)).status).toBe(403);
    expect((await t.call("a@x.id", "DELETE", `/time/entry/${e.id}`)).status).toBe(200);
  });
});

describe("project closing report", () => {
  it("managers close with a summary and links; open tasks need force; reopen works; report respects visibility", async () => {
    const t = setup();
    const proj = await json(await t.call(OWNER, "POST", "/meta/projects", { name: "Kampanye" }));
    const mk = async (email: string, title: string) => (await json(await t.call(OWNER, "POST", "/tasks", { emails: [email], title, projectId: proj.id, needProof: false }))).ids[0] as string;
    const a1 = await mk("a@x.id", "Dikerjakan"), b1 = await mk("b@x.id", "Unit lain");
    const fd = new FormData(); fd.set("link", "https://example.com/hasil");
    expect((await t.call("a@x.id", "POST", `/tasks/${a1}/complete`, fd)).status).toBe(200);

    const body = { summary: "Selesai sesuai target", links: ["https://example.com/final"] };
    expect((await t.call("a@x.id", "POST", `/meta/projects/${proj.id}/close`, body)).status).toBe(403);
    const refused = await t.call(OWNER, "POST", `/meta/projects/${proj.id}/close`, body);
    expect(refused.status).toBe(409);
    expect((await json(refused)).open).toBe(1);
    expect((await t.call(OWNER, "POST", `/meta/projects/${proj.id}/close`, { ...body, links: ["javascript:alert(1)"], force: true })).status).toBe(400);
    expect((await t.call(OWNER, "POST", `/meta/projects/${proj.id}/close`, { ...body, force: true })).status).toBe(200);
    expect((await t.call(OWNER, "POST", `/meta/projects/${proj.id}/close`, { ...body, force: true })).status).toBe(409);
    const meta = await json(await t.call("a@x.id", "GET", "/meta"));
    expect(meta.projects[0]).toMatchObject({ summary: "Selesai sesuai target", links: ["https://example.com/final"] });
    expect(meta.projects[0].closedAt).toBeGreaterThan(0);

    const own = await json(await t.call("a@x.id", "GET", `/reports/project/${proj.id}`));
    expect(own.tasks.map((x: J) => x.title)).toEqual(["Dikerjakan"]);
    expect(own.stats).toMatchObject({ total: 1, done: 1, withProof: 1 });
    expect(own.tasks[0].proofLink).toBe("https://example.com/hasil");
    expect((await json(await t.call(OWNER, "GET", `/reports/project/${proj.id}`))).stats.total).toBe(2);
    expect(b1).toBeTruthy();

    expect((await t.call("a@x.id", "POST", `/meta/projects/${proj.id}/reopen`)).status).toBe(403);
    expect((await t.call(OWNER, "POST", `/meta/projects/${proj.id}/reopen`)).status).toBe(200);
    expect((await json(await t.call(OWNER, "GET", "/meta"))).projects[0].closedAt).toBeNull();
  });
});

describe("equipment bookings and revisions", () => {
  const day = (n: number) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
  it("managers keep the resource list; overlapping bookings are refused; only the booker cancels", async () => {
    const t = setup();
    expect((await t.call("a@x.id", "POST", "/resources", { name: "Kamera A7" })).status).toBe(403);
    const cam = await json(await t.call("hcs@x.id", "POST", "/resources", { name: "Kamera A7", kind: "alat" }));
    const slot = { resourceId: cam.id, date: day(1), start: "09:00", end: "11:00" };
    expect((await t.call("a@x.id", "POST", "/bookings", { ...slot, end: "09:00" })).status).toBe(400);
    expect((await t.call("a@x.id", "POST", "/bookings", { ...slot, date: day(-2) })).status).toBe(400);
    const mine = await t.call("a@x.id", "POST", "/bookings", slot);
    expect(mine.status).toBe(201);
    const clash = await t.call("b@x.id", "POST", "/bookings", { ...slot, start: "10:00", end: "12:00" });
    expect(clash.status).toBe(409);
    expect((await json(clash)).error).toContain("A");
    expect((await t.call("b@x.id", "POST", "/bookings", { ...slot, start: "11:00", end: "12:00" })).status).toBe(201); // touching is fine
    expect((await json(await t.call("b@x.id", "GET", `/bookings?from=${day(0)}&to=${day(3)}`))).length).toBe(2);
    const { id } = await json(mine);
    expect((await t.call("b@x.id", "DELETE", `/bookings/${id}`)).status).toBe(403);
    expect((await t.call("a@x.id", "DELETE", `/bookings/${id}`)).status).toBe(200);
    await t.call("hcs@x.id", "PATCH", `/resources/${cam.id}`, { archived: true });
    expect((await t.call("a@x.id", "POST", "/bookings", slot)).status).toBe(400);
  });
  it("counts how often a task is sent back", async () => {
    const t = setup();
    const id = (await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Revisi", needProof: false }))).ids[0] as string;
    for (let i = 0; i < 2; i++) {
      const fd = new FormData(); fd.set("skipProof", "1");
      await t.call("a@x.id", "POST", `/tasks/${id}/complete`, fd);
      await t.call("hcs@x.id", "POST", `/tasks/${id}/return`);
    }
    expect((await json(await t.call("a@x.id", "GET", "/tasks"))).find((x: J) => x.id === id).revisions).toBe(2);
  });
});

describe("push devices", () => {
  const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: "p", auth: "a" } });
  it("lists only my devices, removes one by id, and rate-limits the test message", async () => {
    const t = setup();
    expect((await t.call(null, "GET", "/push/devices")).status).toBe(401);
    await t.call("a@x.id", "POST", "/push/subscribe", sub("one"));
    await t.call("a@x.id", "POST", "/push/subscribe", sub("two"));
    await t.call("b@x.id", "POST", "/push/subscribe", sub("other"));
    const mine = await json(await t.call("a@x.id", "GET", "/push/devices"));
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ service: "fcm.googleapis.com" });
    expect(JSON.stringify(mine)).not.toContain("/fcm/send/");
    expect((await t.call("b@x.id", "DELETE", `/push/devices/${mine[0].id}`)).status).toBe(200); // someone else's id: nothing happens
    expect((await json(await t.call("a@x.id", "GET", "/push/devices"))).length).toBe(2);
    await t.call("a@x.id", "DELETE", `/push/devices/${mine[0].id}`);
    expect((await json(await t.call("a@x.id", "GET", "/push/devices"))).length).toBe(1);
    expect((await t.call("a@x.id", "POST", "/push/test")).status).toBe(200);
    expect((await t.call("a@x.id", "POST", "/push/test")).status).toBe(429);
    expect(t.sent.some(s => s.to.includes("a@x.id") && s.title === "Notifikasi uji")).toBe(true);
  });
  it("puts a deep link to the task in every task notification", async () => {
    const t = setup();
    const id = (await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Tautan" }))).ids[0] as string;
    await new Promise(r => setTimeout(r, 20));
    expect(t.sent.some(s => s.to.includes("a@x.id") && s.path === `/?t=${id}`)).toBe(true);
  });
});

describe("daily backup", () => {
  it("writes one copy per day, is idempotent, restorable, and prunes to 14", async () => {
    const { mkdtempSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { default: Database } = await import("better-sqlite3");
    const { runBackup } = await import("../src/backup.js");
    const t = setup();
    const dir = mkdtempSync(join(tmpdir(), "bk-"));
    const day0 = Date.UTC(2026, 0, 1, 5);
    const first = await runBackup(t.db, dir, day0);
    expect(first).toBeTruthy();
    expect(await runBackup(t.db, dir, day0 + 3600e3)).toBeNull();
    const copy = new Database(first!, { readonly: true });
    expect((copy.prepare("select count(*) c from members").get() as { c: number }).c).toBe(4);
    copy.close();
    for (let d = 1; d <= 20; d++) await runBackup(t.db, dir, day0 + d * 864e5);
    const files = readdirSync(dir).filter(f => f.endsWith(".db")).sort();
    expect(files).toHaveLength(14);
    expect(files.at(-1)).toBe("app-2026-01-21.db");
  });
});

describe("team chat", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const upload = (t: ReturnType<typeof setup>, as: string, channel: string, file: File) => { const fd = new FormData(); fd.set("channel", channel); fd.set("file", file); return t.call(as, "POST", "/chat/attachments", fd); };
  const post = (t: ReturnType<typeof setup>, as: string, ch: string, body: object) => t.call(as, "POST", `/chat/channels/${ch}/messages`, body);

  it("channels follow project access; strangers get nothing", async () => {
    const t = setup();
    const proj = await json(await t.call(OWNER, "POST", "/meta/projects", { name: "Kampanye" }));
    await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T", projectId: proj.id });
    expect((await json(await t.call("a@x.id", "GET", "/chat/channels"))).map((c: J) => c.id)).toEqual(["general", "p-" + proj.id]);
    expect((await json(await t.call("b@x.id", "GET", "/chat/channels"))).map((c: J) => c.id)).toEqual(["general"]);
    expect((await json(await t.call("hcs@x.id", "GET", "/chat/channels"))).length).toBe(2);
    expect((await t.call("out@x.id", "GET", "/chat/channels")).status).toBe(403);
    expect((await t.call("b@x.id", "GET", `/chat/channels/p-${proj.id}/messages`)).status).toBe(403);
    expect((await post(t, "b@x.id", "p-" + proj.id, { text: "hai" })).status).toBe(403);
    expect((await post(t, "a@x.id", "p-" + proj.id, { text: "hai" })).status).toBe(201);
    expect((await t.call("a@x.id", "GET", "/chat/channels/p-nope/messages")).status).toBe(403);
  });

  it("messages: validation, links shown per viewer, mentions notify, unread, delete rules", async () => {
    const t = setup();
    const task = (await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Rahasia A" }))).ids[0] as string;
    expect((await post(t, "a@x.id", "general", { text: "" })).status).toBe(400);
    expect((await post(t, "b@x.id", "general", { text: "x", refs: [{ type: "task", id: task }] })).status).toBe(400); // cannot link a task you cannot see
    expect((await post(t, "b@x.id", "general", { text: "x", refs: [{ type: "member", id: "nobody@x.id" }] })).status).toBe(400);
    const m = await post(t, "a@x.id", "general", { text: "cek ini @B", refs: [{ type: "task", id: task }, { type: "member", id: "b@x.id" }] });
    expect(m.status).toBe(201);
    expect(t.sent.some(s => s.to.includes("b@x.id") && s.title.includes("menyebutmu"))).toBe(true);
    const seenByB = (await json(await t.call("b@x.id", "GET", "/chat/channels/general/messages"))).messages[0];
    expect(seenByB.refs.find((r: J) => r.type === "task")).toMatchObject({ ok: false, label: "Tugas" }); // the title is not leaked
    const seenByA = (await json(await t.call("a@x.id", "GET", "/chat/channels/general/messages"))).messages[0];
    expect(seenByA.refs.find((r: J) => r.type === "task")).toMatchObject({ ok: true, label: "Rahasia A" });
    expect((await json(await t.call("b@x.id", "GET", "/chat/channels"))).find((c: J) => c.id === "general").unread).toBe(1);
    expect((await json(await t.call("a@x.id", "GET", "/chat/channels"))).find((c: J) => c.id === "general").unread).toBe(0);
    await t.call("b@x.id", "POST", "/chat/channels/general/read");
    expect((await json(await t.call("b@x.id", "GET", "/chat/channels"))).find((c: J) => c.id === "general").unread).toBe(0);
    const id = seenByA.id;
    expect((await t.call("b@x.id", "DELETE", `/chat/messages/${id}`)).status).toBe(403);
    expect((await t.call("hcs@x.id", "DELETE", `/chat/messages/${id}`)).status).toBe(200); // a manager of the author
    const gone = (await json(await t.call("a@x.id", "GET", "/chat/channels/general/messages"))).messages[0];
    expect(gone).toMatchObject({ deleted: true, text: "" });
  });

  it("attachments: real type checked, size capped, only readable by the channel", async () => {
    const t = setup();
    const proj = await json(await t.call(OWNER, "POST", "/meta/projects", { name: "P" }));
    await t.call(OWNER, "POST", "/tasks", { emails: ["a@x.id"], title: "T", projectId: proj.id });
    const pc = "p-" + proj.id;
    expect((await upload(t, "a@x.id", "general", new File([new TextEncoder().encode("<html><script>alert(1)</script>")], "x.png", { type: "image/png" }))).status).toBe(400);
    expect((await upload(t, "a@x.id", "general", new File([PNG], "x.svg", { type: "image/svg+xml" }))).status).toBe(400);
    expect((await upload(t, "a@x.id", "general", new File([new Uint8Array(9 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }))).status).toBe(413);
    expect((await upload(t, "b@x.id", pc, new File([PNG], "x.png", { type: "image/png" }))).status).toBe(403);
    const up = await upload(t, "a@x.id", pc, new File([PNG], "foto?.png", { type: "image/png" }));
    expect(up.status).toBe(201);
    const file = await json(up);
    expect(file.name).toBe("foto_.png");
    expect((await t.call("hcs@x.id", "GET", `/chat/files/${file.id}`)).status).toBe(404); // not attached to a message yet: only its uploader sees it
    expect((await post(t, "hcs@x.id", pc, { attachmentIds: [file.id] })).status).toBe(400); // someone else's upload cannot be used
    expect((await post(t, "a@x.id", "general", { attachmentIds: [file.id] })).status).toBe(400); // wrong channel
    expect((await post(t, "a@x.id", pc, { attachmentIds: [file.id] })).status).toBe(201);
    const dl = await t.call("hcs@x.id", "GET", `/chat/files/${file.id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("image/png");
    expect(dl.headers.get("content-security-policy")).toContain("sandbox");
    expect((await t.call("b@x.id", "GET", `/chat/files/${file.id}`)).status).toBe(404); // b has no access to the project channel
    const pdf = await json(await upload(t, "a@x.id", "general", new File([new TextEncoder().encode("%PDF-1.4")], "a.pdf", { type: "application/pdf" })));
    await post(t, "a@x.id", "general", { text: "lihat", attachmentIds: [pdf.id] });
    expect((await t.call("b@x.id", "GET", `/chat/files/${pdf.id}`)).headers.get("content-disposition")).toContain("attachment");
  });
});

describe("leave evidence", () => {
  const day = (n: number) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
  const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  it("link and photo are optional, safe, and visible to the requester and their managers only", async () => {
    const t = setup();
    const body = { kind: "sakit", from: day(1), to: day(1) };
    expect((await t.call("a@x.id", "POST", "/leaves", { ...body, proofLink: "javascript:alert(1)" })).status).toBe(400);
    const made = await t.call("a@x.id", "POST", "/leaves", { ...body, proofLink: "https://example.com/surat-dokter" });
    expect(made.status).toBe(201);
    const l = await json(made);
    expect(l).toMatchObject({ proofLink: "https://example.com/surat-dokter", hasPhoto: false });
    expect((await t.call("a@x.id", "PUT", `/leaves/${l.id}/proof`, new Uint8Array([1, 2, 3, 4, 5]))).status).toBe(400);
    expect((await t.call("b@x.id", "PUT", `/leaves/${l.id}/proof`, JPG)).status).toBe(403);
    expect((await t.call("a@x.id", "PUT", `/leaves/${l.id}/proof`, JPG)).status).toBe(200);
    expect((await json(await t.call("a@x.id", "GET", "/leaves")))[0].hasPhoto).toBe(true);
    expect((await t.call("hcs@x.id", "GET", `/leaves/${l.id}/proof`)).headers.get("content-type")).toBe("image/jpeg");
    expect((await t.call("b@x.id", "GET", `/leaves/${l.id}/proof`)).status).toBe(404);
    await t.call("hcs@x.id", "PATCH", `/leaves/${l.id}/decision`, { status: "approved" });
    expect((await t.call("a@x.id", "PUT", `/leaves/${l.id}/proof`, JPG)).status).toBe(403); // frozen once decided
  });
});

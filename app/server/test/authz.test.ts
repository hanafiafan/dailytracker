import { describe, expect, it } from "vitest";
import { OWNER, setup } from "./helpers.js";

type J = Record<string, any>;
const json = async (r: Response) => (await r.json()) as J;

// Authorization matrix: for each endpoint, who is let in. "a" owns the data (unit HCS), "b" is a member of another unit,
// "out" is signed in with Google but is not in the team, null is not signed in at all.
describe("authorization matrix", () => {
  it("every endpoint refuses people who may not touch the data", async () => {
    const t = setup();
    const made = await json(await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Milik A", needProof: false }));
    const id = made.ids[0] as string;
    const sub = await json(await t.call("a@x.id", "POST", `/tasks/${id}/subtasks`, { title: "Langkah" }));
    const cm = await json(await t.call("a@x.id", "POST", `/tasks/${id}/comments`, { text: "halo", mentions: [] }));
    const proj = await json(await t.call(OWNER, "POST", "/meta/projects", { name: "P" }));
    const res = await json(await t.call("hcs@x.id", "POST", "/resources", { name: "Kamera" }));
    const lv = await json(await t.call("a@x.id", "POST", "/leaves", { kind: "izin", from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }));
    await t.call("a@x.id", "POST", `/time/${id}/start`);
    await t.call("a@x.id", "POST", "/time/stop");
    const entry = (await json(await t.call("a@x.id", "GET", `/time/task/${id}`))).entries[0];
    const sid = sub.id ?? sub.subtask?.id, cid = cm.id ?? cm.comment?.id;

    // [method, path, body, who must NOT succeed]
    const guarded: [string, string, unknown, (string | null)[]][] = [
      ["GET", `/tasks/${id}`, undefined, ["b@x.id", "out@x.id", null]],
      ["PATCH", `/tasks/${id}`, { title: "x" }, ["b@x.id", "out@x.id", null]],
      ["PATCH", `/tasks/${id}/status`, { status: "doing" }, ["b@x.id", "out@x.id", null]],
      ["PUT", `/tasks/${id}/report`, { report: "x" }, ["b@x.id", "out@x.id", null]],
      ["GET", `/tasks/${id}/proof`, undefined, ["b@x.id", "out@x.id", null]],
      ["GET", `/tasks/${id}/activity`, undefined, ["b@x.id", "out@x.id", null]],
      ["POST", `/tasks/${id}/subtasks`, { title: "x" }, ["b@x.id", "out@x.id", null]],
      ["PATCH", `/tasks/${id}/subtasks/${sid}`, { done: true }, ["b@x.id", "out@x.id", null]],
      ["DELETE", `/tasks/${id}/subtasks/${sid}`, undefined, [null]], // others get a silent 200 (idempotent delete) but nothing is removed: checked below
      ["POST", `/tasks/${id}/comments`, { text: "x", mentions: [] }, ["b@x.id", "out@x.id", null]],
      ["DELETE", `/tasks/${id}/comments/${cid}`, undefined, ["b@x.id", "out@x.id", null]],
      ["POST", `/tasks/${id}/nudge`, undefined, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["POST", `/tasks/${id}/return`, undefined, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["DELETE", `/tasks/${id}`, undefined, ["b@x.id", "out@x.id", null]],
      ["POST", `/time/${id}/start`, undefined, ["b@x.id", "out@x.id", null]],
      ["GET", `/time/task/${id}`, undefined, ["b@x.id", "out@x.id", null]],
      ["DELETE", `/time/entry/${entry?.id}`, undefined, ["b@x.id", "out@x.id", null]],
      ["GET", "/team", undefined, ["out@x.id", null]],
      ["POST", "/team", { name: "N", email: "n@x.id" }, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["DELETE", "/team/a@x.id", undefined, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["PUT", "/team/order", { order: ["a@x.id"] }, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["GET", "/meta", undefined, ["out@x.id", null]],
      ["POST", "/meta/projects", { name: "x" }, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["PATCH", `/meta/projects/${proj.id}`, { name: "y" }, ["a@x.id", "out@x.id", null]],
      ["POST", `/meta/projects/${proj.id}/close`, { summary: "", links: [], force: true }, ["a@x.id", "out@x.id", null]],
      ["POST", `/meta/projects/${proj.id}/reopen`, undefined, ["a@x.id", "out@x.id", null]],
      ["DELETE", `/meta/projects/${proj.id}`, undefined, ["a@x.id", "hcs@x.id", "out@x.id", null]],
      ["POST", "/meta/labels", { name: "x" }, ["a@x.id", "out@x.id", null]],
      ["GET", "/reports/analytics", undefined, ["out@x.id", null]],
      ["GET", "/reports/tasks.csv", undefined, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["GET", `/reports/project/${proj.id}`, undefined, [null]],
      ["GET", "/time/report", undefined, [null]],
      ["GET", "/leaves", undefined, [null]],
      ["POST", "/leaves", { kind: "cuti", from: "2099-01-01", to: "2099-01-02" }, ["out@x.id", null]],
      ["PATCH", `/leaves/${lv.id}/decision`, { status: "approved" }, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["DELETE", `/leaves/${lv.id}`, undefined, ["b@x.id", "out@x.id", null]],
      ["GET", "/resources", undefined, [null]],
      ["POST", "/resources", { name: "x" }, ["a@x.id", "b@x.id", "out@x.id", null]],
      ["DELETE", `/resources/${res.id}`, undefined, ["a@x.id", "hcs@x.id", "out@x.id", null]],
      ["POST", "/bookings", { resourceId: res.id, date: "2099-01-01", start: "09:00", end: "10:00" }, ["out@x.id", null]],
      ["GET", "/bookings", undefined, [null]],
      ["GET", "/inbox/notifications", undefined, [null]],
      ["GET", "/inbox/activity", undefined, [null]],
      ["GET", "/links", undefined, [null]],
      ["POST", "/links", { title: "x", url: "https://example.com" }, ["a@x.id", "out@x.id", null]],
      ["GET", "/routines", undefined, [null]],
      ["GET", "/push/devices", undefined, [null]],
      ["POST", "/push/test", undefined, [null]],
    ];
    const leaks: string[] = [];
    for (const [method, path, body, who] of guarded) {
      for (const user of who) {
        const r = await t.call(user, method, path, body);
        if (r.status < 400) leaks.push(`${user ?? "anon"} ${method} ${path} -> ${r.status}`);
      }
    }
    expect(leaks).toEqual([]);
    for (const user of ["b@x.id", "out@x.id"]) await t.call(user, "DELETE", `/tasks/${id}/subtasks/${sid}`);

    // the data is intact after all the refused attempts
    const task = await json(await t.call("a@x.id", "GET", `/tasks/${id}`));
    expect(task).toMatchObject({ title: "Milik A", status: "doing" });
    expect(task.subtasks).toHaveLength(1);
    expect(task.comments).toHaveLength(1);
  });

  it("people cannot see tasks of others in lists, search, activity, or exports", async () => {
    const t = setup();
    await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Rahasia A" });
    const list = async (u: string, p: string) => JSON.stringify(await json(await t.call(u, "GET", p)));
    for (const [u, p] of [["b@x.id", "/tasks"], ["b@x.id", "/inbox/activity"], ["b@x.id", "/reports/analytics"], ["b@x.id", "/time/report"], ["b@x.id", "/bookings"]] as const) expect(await list(u, p)).not.toContain("Rahasia A");
    expect(await list("a@x.id", "/tasks")).toContain("Rahasia A");
    expect(await list("hcs@x.id", "/tasks")).toContain("Rahasia A");
  });

  it("rejects cross-site writes without the x-app header, and malformed ids and bodies", async () => {
    const t = setup();
    expect((await t.call("a@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "x" }, { "x-app": "0" })).status).toBe(400);
    expect((await t.call("a@x.id", "GET", "/tasks/does-not-exist")).status).toBeGreaterThanOrEqual(400);
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: [], title: "x" })).status).toBe(400);
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "x".repeat(500) })).status).toBe(400);
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "x", date: "31-12-2026" })).status).toBe(400);
    expect((await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "x", start: "25:99" })).status).toBe(400);
  });
});

describe("request size", () => {
  it("refuses oversized bodies before reading them", async () => {
    const t = setup();
    const big = new Uint8Array(3 * 1024 * 1024); big.set([0xff, 0xd8, 0xff]);
    const r = await t.call("a@x.id", "PUT", "/team/a@x.id/photo", big);
    expect(r.status).toBe(413);
    expect((await t.call("a@x.id", "PUT", "/team/a@x.id/photo", new Uint8Array(10))).status).toBe(400);
  });
});

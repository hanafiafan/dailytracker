import { describe, expect, it } from "vitest";
import { members } from "../src/db/schema.js";
import { JPEG, setup } from "./helpers.js";

const json = async (r: Response) => (await r.json()) as any;

describe("project detail: client account, service targets, deliverables", () => {
  const boot = async () => {
    const t = setup();
    t.db.insert(members).values([{ email: "c@x.id", name: "Klien", accountType: "client", sortOrder: 9 }, { email: "c2@x.id", name: "Klien Dua", accountType: "client", sortOrder: 10 }]).run();
    const p = await json(await t.call("vero@x.id", "POST", "/meta/projects", { name: "Foto Produk", clientEmail: "c@x.id", pmEmail: "vero@x.id", startDate: "2026-10-01", dueDate: "2026-10-31" }));
    const s = await json(await t.call("vero@x.id", "POST", `/meta/projects/${p.id}/services`, { name: "Foto produk", targetQty: 100, unit: "foto", picEmails: ["a@x.id"] }));
    return { t, p, s };
  };

  it("rejects a due date before the start date", async () => {
    const { t } = await boot();
    expect((await t.call("vero@x.id", "POST", "/meta/projects", { name: "X", startDate: "2026-10-31", dueDate: "2026-10-01" })).status).toBe(400);
  });

  it("stores the number of deliverables a task produced, and counts it per service", async () => {
    const { t, p, s } = await boot();
    const task = await json(await t.call("vero@x.id", "POST", "/tasks", { title: "Foto batch 1", emails: ["a@x.id"], projectId: p.id, serviceId: s.id }));
    const id = (task.ids ?? [task.id ?? task[0]?.id])[0];
    const fd = new FormData(); fd.set("photo", new Blob([JPEG], { type: "image/jpeg" }), "b.jpg"); fd.set("qty", "35");
    expect((await t.call("a@x.id", "POST", `/tasks/${id}/complete`, fd)).status).toBe(200);
    const rep = await json(await t.call("vero@x.id", "GET", `/reports/project/${p.id}`));
    expect(rep.services[0]).toMatchObject({ targetQty: 100, unit: "foto", picEmails: ["a@x.id"] });
    expect(rep.tasks[0]).toMatchObject({ qty: 35, serviceId: s.id });
  });

  it("shows a client only their own project", async () => {
    const { t, p } = await boot();
    const mine = await json(await t.call("c@x.id", "GET", "/meta"));
    expect(mine.projects.map((x: any) => x.id)).toEqual([p.id]);
    expect((await t.call("c@x.id", "GET", `/reports/project/${p.id}`)).status).toBe(200);
    expect((await json(await t.call("c2@x.id", "GET", "/meta"))).projects).toEqual([]);
    expect((await t.call("c2@x.id", "GET", `/reports/project/${p.id}`)).status).toBe(404);
    expect((await t.call("c2@x.id", "GET", `/meta/projects/${p.id}/services`)).status).toBe(404);
  });

  it("does not give tasks to a client account, nor a service from another project", async () => {
    const { t, p, s } = await boot();
    expect((await t.call("vero@x.id", "POST", "/tasks", { title: "X", emails: ["c@x.id"], projectId: p.id })).status).toBe(400);
    const other = await json(await t.call("vero@x.id", "POST", "/meta/projects", { name: "Lain" }));
    expect((await t.call("vero@x.id", "POST", "/tasks", { title: "Y", emails: ["a@x.id"], projectId: other.id, serviceId: s.id })).status).toBe(400);
    expect((await t.call("vero@x.id", "POST", "/tasks", { title: "Z", emails: ["a@x.id"], projectId: p.id, serviceId: s.id })).status).toBe(201);
  });
});

describe("client accounts are guests", () => {
  it("cannot create or change work, and only meets the people on their own project", async () => {
    const t = setup();
    t.db.insert(members).values({ email: "c@x.id", name: "Klien", accountType: "client", sortOrder: 9 }).run();
    const p = await json(await t.call("vero@x.id", "POST", "/meta/projects", { name: "P", clientEmail: "c@x.id", pmEmail: "vero@x.id" }));
    await t.call("vero@x.id", "POST", "/tasks", { title: "T", emails: ["a@x.id"], projectId: p.id });
    expect((await t.call("c@x.id", "POST", "/tasks", { title: "sendiri", emails: ["c@x.id"] })).status).toBe(403);
    expect((await t.call("c@x.id", "POST", "/ask")).status).toBe(403);
    const team = await json(await t.call("c@x.id", "GET", "/team"));
    expect(team.map((m: any) => m.email).sort()).toEqual(["a@x.id", "c@x.id", "vero@x.id"]);
  });
});

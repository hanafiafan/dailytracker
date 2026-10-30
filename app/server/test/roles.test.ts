import { describe, expect, it } from "vitest";
import { OWNER, setup } from "./helpers.js";

const json = async (r: Response) => await r.json() as any;
const tasksOf = async (t: ReturnType<typeof setup>, who: string) => { const j = await json(await t.call(who, "GET", "/tasks?from=2020-01-01")); return Array.isArray(j) ? j : []; };

describe("roles cannot be self-assigned", () => {
  it("editing your own title or name grants nothing", async () => {
    const t = setup();
    await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Rahasia A", needProof: false });
    for (const patch of [{ role: "Project Manager" }, { role: "Brand Owner" }, { role: "Direktur" }, { name: "Hanief" }, { name: "Aziz" }, { name: "Vero" }]) {
      await t.call("b@x.id", "PATCH", "/team/b@x.id", patch);
      expect((await tasksOf(t, "b@x.id")).some(x => x.title === "Rahasia A")).toBe(false);
      expect((await t.call("b@x.id", "PATCH", "/tasks/x", { title: "x" })).status).not.toBe(200);
    }
  });
  it("the level set by the superadmin does grant it, and only the superadmin can set it", async () => {
    const t = setup();
    await t.call("hcs@x.id", "POST", "/tasks", { emails: ["a@x.id"], title: "Rahasia A", needProof: false });
    expect((await t.call("b@x.id", "PATCH", "/team/b@x.id", { level: "Project Manager" })).status).toBe(403);
    expect((await t.call(OWNER, "PATCH", "/team/b@x.id", { level: "Project Manager" })).status).toBe(200);
    expect((await tasksOf(t, "b@x.id")).some(x => x.title === "Rahasia A")).toBe(true);
  });
});

describe("entities", () => {
  it("cannot be deleted while members use them, and their code cannot change", async () => {
    const t = setup();
    await t.call(OWNER, "POST", "/meta/entities", { id: "ZZ", name: "ZZ" });
    await t.call(OWNER, "POST", "/team", { email: "z@x.id", name: "Z", group: "ZZ" });
    await t.call(OWNER, "POST", "/team", { email: "y@x.id", name: "Y", extraGroups: ["ZZ"] });
    expect((await t.call(OWNER, "DELETE", "/meta/entities/ZZ")).status).toBe(409);
    await t.call(OWNER, "PATCH", "/team/z@x.id", { group: "HCS" });
    await t.call(OWNER, "PATCH", "/team/y@x.id", { extraGroups: [] });
    expect((await t.call(OWNER, "DELETE", "/meta/entities/ZZ")).status).toBe(200);
  });
  it("a restart rewrites no roles and re-creates no deleted entities", async () => {
    const { openDb } = await import("../src/db/index.js");
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "th-")), "t.db");
    const first = openDb(file);
    first.sqlite.prepare("INSERT INTO members (email, name, role, level) VALUES ('h@x.id', 'Hanief', 'Staf', 'Staff')").run();
    first.sqlite.prepare("DELETE FROM entities").run();
    first.sqlite.close();
    const again = openDb(file);
    expect(again.sqlite.prepare("SELECT level, role FROM members").get()).toEqual({ level: "Staff", role: "Staf" });
    expect((again.sqlite.prepare("SELECT count(*) c FROM entities").get() as { c: number }).c).toBe(0);
  });
});

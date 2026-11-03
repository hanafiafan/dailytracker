import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, OWNER } from "./helpers.js";
import { backupNow, restoreBackup, runBackup, setBackupSettings } from "../src/backup.js";
import { members, tasks } from "../src/db/schema.js";
import { openDb } from "../src/db/index.js";

describe("custom backup sessions", () => {
  it("writes one copy per passed session, skips future ones, prunes only scheduled copies", async () => {
    const t = setup();
    const dir = mkdtempSync(join(tmpdir(), "bk-"));
    setBackupSettings(t.db, { enabled: true, times: ["06:00", "12:00", "18:00"], keep: 2 });
    const noon = Date.UTC(2026, 0, 1, 6, 30); // 13:30 WIB: 06:00 and 12:00 have passed
    expect(await runBackup(t.db, dir, noon)).toHaveLength(2);
    expect(await runBackup(t.db, dir, noon)).toHaveLength(0);
    expect(readdirSync(dir).sort()).toEqual(["auto-2026-01-01-0600.db", "auto-2026-01-01-1200.db"]);
    await runBackup(t.db, dir, noon + 864e5); // next day: two more, oldest two pruned
    expect(readdirSync(dir).sort()).toEqual(["auto-2026-01-02-0600.db", "auto-2026-01-02-1200.db"]);
    setBackupSettings(t.db, { enabled: false, times: ["00:00"], keep: 2 });
    expect(await runBackup(t.db, dir, noon + 2 * 864e5)).toHaveLength(0);
  });
});

describe("backups and reset API (superadmin only)", () => {
  it("rejects non-superadmins, validates sessions, resets with a surviving pre-reset copy", async () => {
    const t = setup(mkdtempSync(join(tmpdir(), "bkapi-")));
    expect((await t.call("vero@x.id", "GET", "/admin/backups")).status).toBe(403);
    expect((await t.call("vero@x.id", "POST", "/admin/reset", { confirm: "RESET" })).status).toBe(403);
    expect((await t.call(OWNER, "PUT", "/admin/backups/settings", { enabled: true, times: ["25:00"], keep: 5 })).status).toBe(400);
    const ok = await t.call(OWNER, "PUT", "/admin/backups/settings", { enabled: true, times: ["18:00", "06:00", "06:00"], keep: 5 });
    expect(await ok.json()).toEqual({ enabled: true, times: ["06:00", "18:00"], keep: 5 });
    expect((await t.call(OWNER, "POST", "/admin/reset", { chat: false })).status).toBe(400); // needs confirm

    const m = await t.call(OWNER, "POST", "/admin/backups", { label: "Sebelum Launch!" });
    const { file } = await m.json() as { file: string };
    expect(file).toMatch(/^manual-.*-sebelum-launch\.db$/);

    t.db.insert(tasks).values({ id: "t1", email: "a@x.id", date: "2026-01-01", title: "x", createdBy: "a@x.id", createdAt: 1 } as never).run();
    const plan = await (await t.call(OWNER, "POST", "/admin/reset/plan", {})).json() as { remove: { n: number }[] };
    expect(plan.remove[0]!.n).toBe(1);
    const r = await (await t.call(OWNER, "POST", "/admin/reset", { confirm: "RESET" })).json() as { backup: string };
    expect(r.backup).toMatch(/^pre-reset-/);
    const list = await (await t.call(OWNER, "GET", "/admin/backups")).json() as { files: { file: string }[] };
    expect(list.files.map(f => f.file)).toEqual(expect.arrayContaining([file, r.backup]));
    expect((await t.call(OWNER, "DELETE", "/admin/backups/..%2Fapp.db")).status).toBe(404);
    expect((await t.call(OWNER, "DELETE", "/admin/backups/" + file)).status).toBe(200);
  });
});

describe("download, upload and restore", () => {
  it("round-trips a backup through download and upload; rejects junk; restore swaps data and keeps a copy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bkio-"));
    const t = setup(dir);
    const { file } = await (await t.call(OWNER, "POST", "/admin/backups", { label: "x" })).json() as { file: string };
    expect((await t.call("vero@x.id", "GET", `/admin/backups/${file}/download`)).status).toBe(403);
    expect((await t.call(OWNER, "GET", "/admin/backups/nope.db/download")).status).toBe(404);
    const dl = await t.call(OWNER, "GET", `/admin/backups/${file}/download`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    expect(dl.headers.get("content-disposition")).toContain(file);
    const up = (b: Uint8Array) => { const fd = new FormData(); fd.set("file", new File([b as BlobPart], "Dari Laptop.db")); return t.call(OWNER, "POST", "/admin/backups/upload", fd); };
    const good = await up(bytes);
    expect(good.status).toBe(200);
    expect(((await good.json()) as { file: string }).file).toMatch(/^manual-.*-unggahan-dari-laptop\.db$/);
    expect((await up(new TextEncoder().encode("bukan database"))).status).toBe(400);
    expect(readdirSync(dir + "/backups").some(f => f.endsWith(".tmp"))).toBe(false);
    expect((await t.call(OWNER, "POST", `/admin/backups/${file}/restore`, { confirm: "PULIHKAN" })).status).toBe(501); // no restart hook in tests
  });

  it("restoreBackup puts the old data back on disk and keeps a pre-reset copy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bkrs-"));
    const path = join(dir, "app.db"), bk = join(dir, "backups");
    const db = openDb(path);
    db.insert(members).values({ email: "a@x.id", name: "Lama" }).run();
    const old = (await backupNow(db, bk, "manual", "lama")).split("/").pop()!;
    db.insert(members).values({ email: "b@x.id", name: "Baru" }).run();
    expect(await restoreBackup(db, bk, path, "../etc/passwd")).toBeNull();
    const before = await restoreBackup(db, bk, path, old);
    expect(before).toMatch(/pre-reset-.*sebelum-pulihkan/);
    const re = openDb(path);
    expect(re.select().from(members).all().map(m => m.email)).toEqual(["a@x.id"]);
    expect(readdirSync(bk)).toContain(before!.split("/").pop());
  });
});

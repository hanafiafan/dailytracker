import { describe, expect, it } from "vitest";
import { popupInput } from "@shared/schemas";
import { eq } from "drizzle-orm";
import { popups } from "../src/db/schema.js";
import { OWNER, setup } from "./helpers.js";
import { openDb } from "../src/db/index.js";

describe("popup input", () => {
  it("accepts every block type and refuses unsafe urls", () => {
    const ok = { title: "Halo", active: true, blocks: [
      { type: "heading", text: "H" }, { type: "text", text: "t" }, { type: "list", items: ["a"] }, { type: "list", style: "number", items: ["a"] }, { type: "list", style: "check", items: ["a"] }, { type: "quote", text: "q" }, { type: "accordion", title: "t", text: "x" }, { type: "divider" }, { type: "callout", tone: "warn", text: "x" },
      { type: "image", src: "data:image/jpeg;base64,AAAA" }, { type: "video", url: "https://youtu.be/abcdefghijk" }, { type: "button", label: "Buka", url: "https://a.id" },
    ] };
    expect(popupInput.safeParse(ok).success).toBe(true);
    expect(popupInput.safeParse({ ...ok, blocks: [{ type: "list", style: "roman", items: ["a"] }] }).success).toBe(false);
    expect(popupInput.safeParse(ok).data?.blocks[2]).toMatchObject({ type: "list", style: "bullet" }); // old popups without a style stay bullets
    expect(popupInput.safeParse({ ...ok, blocks: [{ type: "button", label: "x", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(popupInput.safeParse({ ...ok, blocks: [{ type: "image", src: "https://evil/x.png" }] }).success).toBe(false);
  });
  it("migration creates the tables", () => {
    const db = openDb(":memory:");
    expect(db.sqlite.prepare("SELECT count(*) c FROM popups").get()).toEqual({ c: 0 });
  });
  it("only the superadmin writes; each member sees an active popup until dismissed", async () => {
    const t = setup();
    await t.call(OWNER, "POST", "/team", { email: "a@x.id", name: "A" }); // ensure a plain member exists
    const body = { title: "Info", active: true, blocks: [{ type: "text", text: "Halo" }] };
    expect((await t.call("a@x.id", "POST", "/popups", body)).status).toBe(403);
    const made = await (await t.call(OWNER, "POST", "/popups", body)).json() as { id: string };
    expect(((await (await t.call("a@x.id", "GET", "/popups/active")).json()) as unknown[]).length).toBe(1);
    expect((await t.call("a@x.id", "POST", `/popups/${made.id}/seen`)).status).toBe(200);
    expect(((await (await t.call("a@x.id", "GET", "/popups/active")).json()) as unknown[]).length).toBe(0);
    expect(((await (await t.call(OWNER, "GET", "/popups/active")).json()) as unknown[]).length).toBe(1);
  });

  it("drafts and expired popups are never shown; the preset clock starts on publish", async () => {
    const t = setup(), seen = async () => ((await (await t.call("a@x.id", "GET", "/popups/active")).json()) as { id: string }[]);
    const body = { title: "T", active: true, blocks: [{ type: "text", text: "x" }] };
    const draft = await (await t.call(OWNER, "POST", "/popups", { ...body, draft: true, durationMin: 60 })).json() as { id: string; endsAt: number | null };
    expect(draft.endsAt).toBeNull(); // no clock while it is a draft
    expect(await seen()).toHaveLength(0);
    const before = Date.now();
    expect((await t.call(OWNER, "PUT", `/popups/${draft.id}`, { ...body, draft: false, durationMin: 60 })).status).toBe(200);
    const live = (await (await t.call(OWNER, "GET", "/popups")).json() as { id: string; endsAt: number }[]).find(p => p.id === draft.id)!;
    expect(live.endsAt).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(await seen()).toHaveLength(1);
    // a plain edit keeps the clock; a new preset restarts it
    await t.call(OWNER, "PUT", `/popups/${draft.id}`, { ...body, title: "T2", durationMin: 60 });
    expect((await (await t.call(OWNER, "GET", "/popups")).json() as { endsAt: number }[])[0]!.endsAt).toBe(live.endsAt);
    // expired: hidden; a fixed time in the past is refused
    t.db.update(popups).set({ endsAt: Date.now() - 1000 }).where(eq(popups.id, draft.id)).run();
    expect(await seen()).toHaveLength(0);
    expect((await t.call(OWNER, "POST", "/popups", { ...body, endsAt: Date.now() - 1000 })).status).toBe(400);
    expect((await t.call(OWNER, "POST", "/popups", { ...body, draft: true, endsAt: Date.now() - 1000 })).status).toBe(201); // drafts may hold any time
  });
});

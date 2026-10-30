import { describe, expect, it } from "vitest";
import { popupInput } from "@shared/schemas";
import { OWNER, setup } from "./helpers.js";
import { openDb } from "../src/db/index.js";

describe("popup input", () => {
  it("accepts every block type and refuses unsafe urls", () => {
    const ok = { title: "Halo", active: true, blocks: [
      { type: "heading", text: "H" }, { type: "text", text: "t" }, { type: "list", items: ["a"] }, { type: "callout", tone: "warn", text: "x" },
      { type: "image", src: "data:image/jpeg;base64,AAAA" }, { type: "video", url: "https://youtu.be/abcdefghijk" }, { type: "button", label: "Buka", url: "https://a.id" },
    ] };
    expect(popupInput.safeParse(ok).success).toBe(true);
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
});

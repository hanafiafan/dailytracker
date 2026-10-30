import { describe, expect, it } from "vitest";
import { makePolicy, unitsOf } from "@shared/policy";
import { OWNER, setup } from "./helpers.js";

const m = (email: string, group: string, extra: Partial<Parameters<typeof makePolicy>[2][number]> = {}) => ({ email, group, isAdmin: false, adminGroups: [], ...extra });

describe("several units per account", () => {
  it("an admin of the extra unit manages the person; an admin of another unit does not", () => {
    const team = [m("adm@x.id", "HCM", { isAdmin: true, adminGroups: ["HCM"] }), m("oth@x.id", "HUC", { isAdmin: true, adminGroups: ["HUC"] }), m("p@x.id", "HCS", { extraGroups: ["HCM"] })];
    expect(unitsOf(team[2]!)).toEqual(["HCS", "HCM"]);
    expect(makePolicy("adm@x.id", false, team).canManage("p@x.id")).toBe(true);
    expect(makePolicy("oth@x.id", false, team).canManage("p@x.id")).toBe(false);
  });
  it("superadmin can save extra units", async () => {
    const t = setup();
    await t.call(OWNER, "POST", "/team", { email: "a@x.id", name: "A", group: "HCS" });
    expect((await t.call(OWNER, "PATCH", "/team/a@x.id", { extraGroups: ["hcm", "huc"] })).status).toBe(200);
    const list = await (await t.call(OWNER, "GET", "/team")).json() as { email: string; extraGroups: string[] }[];
    expect(list.find(x => x.email === "a@x.id")?.extraGroups).toEqual(["HCM", "HUC"]);
  });
});

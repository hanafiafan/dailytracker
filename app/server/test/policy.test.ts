import { describe, expect, it } from "vitest";
import { makePolicy, type PolicyMember } from "@shared/policy";

const team: PolicyMember[] = [
  { email: "vero@x.id", group: "", isAdmin: true, adminGroups: [] },
  { email: "hcs@x.id", group: "HCS", isAdmin: true, adminGroups: ["HCS"] },
  { email: "a@x.id", group: "HCS", isAdmin: false, adminGroups: [] },
  { email: "b@x.id", group: "ADS", isAdmin: false, adminGroups: [] },
];
const as = (me: string, owner = false) => makePolicy(me, owner, team);

describe("policy", () => {
  it("owner and unrestricted admin manage everyone", () => {
    for (const p of [as("owner@x.id", true), as("vero@x.id")]) {
      expect(p.isBoss).toBe(true);
      expect(p.canManage("b@x.id")).toBe(true);
      expect(p.canManage("hcs@x.id")).toBe(true);
    }
  });
  it("unit admin manages only ordinary members of their unit", () => {
    const p = as("hcs@x.id");
    expect(p.isBoss).toBe(false);
    expect(p.canManage("a@x.id")).toBe(true);
    expect(p.canManage("b@x.id")).toBe(false);
    expect(p.canManage("vero@x.id")).toBe(false);
  });
  it("unit admin cannot make admins or move people out of their unit", () => {
    const p = as("hcs@x.id");
    expect(p.canEditMember("a@x.id", { isAdmin: true })).toBe(false);
    expect(p.canEditMember("a@x.id", { adminGroups: ["HCS"] })).toBe(false);
    expect(p.canEditMember("a@x.id", { group: "ADS" })).toBe(false);
    expect(p.canEditMember("a@x.id", { group: "HCS" })).toBe(true);
    expect(p.canCreateMember("ADS", false)).toBe(false);
    expect(p.canCreateMember("HCS", true)).toBe(false);
    expect(p.canCreateMember("HCS", false)).toBe(true);
  });
  it("a member sees only themself", () => {
    const p = as("a@x.id");
    expect(p.canSee("a@x.id")).toBe(true);
    expect(p.canSee("b@x.id")).toBe(false);
    expect(p.canManage("a@x.id")).toBe(false);
    expect(p.isManager).toBe(false);
  });
  it("a stranger sees nothing", () => {
    const p = as("who@x.id");
    expect(p.isMember).toBe(false);
    expect(p.canSee("a@x.id")).toBe(false);
  });
});

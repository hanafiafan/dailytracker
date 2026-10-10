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
  it("only the superadmin (owner) restructures the team; managers may fix name and title", () => {
    for (const who of ["hcs@x.id", "vero@x.id"]) {
      const p = as(who);
      expect(p.isSuper).toBe(false);
      expect(p.canCreateMember()).toBe(false);
      expect(p.canEditMember("a@x.id", { isAdmin: true })).toBe(false);
      expect(p.canEditMember("a@x.id", { adminGroups: ["HCS"] })).toBe(false);
      expect(p.canEditMember("a@x.id", { group: "HCS" })).toBe(false);
    }
    expect(as("hcs@x.id").canEditMember("a@x.id", { name: "A", role: "B" })).toBe(true);
    expect(as("hcs@x.id").canEditMember("b@x.id", { name: "A" })).toBe(false);
    const o = as("boss@x.id", true);
    expect(o.isSuper && o.canCreateMember() && o.canEditMember("a@x.id", { isAdmin: true })).toBe(true);
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

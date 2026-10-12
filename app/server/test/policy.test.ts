import { describe, expect, it } from "vitest";
import { makePolicy, type PolicyMember } from "@shared/policy";

const team: PolicyMember[] = [
  { email: "hanief@x.id", name: "Hanief", role: "BO", group: "", isAdmin: true, adminGroups: [] },
  { email: "aziz@x.id", name: "Aziz", role: "Direktur", group: "", isAdmin: true, adminGroups: [] },
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
  it("BO (Hanief) connects only with Director (Aziz) and sits above Aziz", () => {
    const bo = as("hanief@x.id");
    expect(bo.isBO).toBe(true);
    expect(bo.isManager).toBe(true);
    expect(bo.isSuper).toBe(true);
    // BO can see and manage Director (Aziz) and self
    expect(bo.canSee("hanief@x.id")).toBe(true);
    expect(bo.canSee("aziz@x.id")).toBe(true);
    expect(bo.canManage("aziz@x.id")).toBe(true);
    // BO cannot see or manage ordinary staff or unit admins
    expect(bo.canSee("a@x.id")).toBe(false);
    expect(bo.canSee("b@x.id")).toBe(false);
    expect(bo.canSee("hcs@x.id")).toBe(false);
    expect(bo.canManage("a@x.id")).toBe(false);

    // Ordinary members cannot see or manage BO
    const staff = as("a@x.id");
    expect(staff.canSee("hanief@x.id")).toBe(false);
    expect(staff.canManage("hanief@x.id")).toBe(false);

    // Director (Aziz) can see and manage BO and the rest of the team
    const dir = as("aziz@x.id");
    expect(dir.isDirector).toBe(true);
    expect(dir.canSee("hanief@x.id")).toBe(true);
    expect(dir.canManage("hanief@x.id")).toBe(true);
    expect(dir.canSee("a@x.id")).toBe(true);
    expect(dir.canManage("a@x.id")).toBe(true);
  });
  it("Superadmin (Hellens / owner) has full access to everyone including BO and Director", () => {
    const superadmin = as("hellensdev@gmail.com", true);
    expect(superadmin.isOwner).toBe(true);
    expect(superadmin.isSuper).toBe(true);
    expect(superadmin.isBoss).toBe(true);
    expect(superadmin.canSee("hanief@x.id")).toBe(true);
    expect(superadmin.canManage("hanief@x.id")).toBe(true);
    expect(superadmin.canSee("aziz@x.id")).toBe(true);
    expect(superadmin.canManage("aziz@x.id")).toBe(true);
    expect(superadmin.canSee("a@x.id")).toBe(true);
    expect(superadmin.canManage("a@x.id")).toBe(true);
  });
});

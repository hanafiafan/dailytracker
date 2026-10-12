// Who may see and change what. Pure functions so the server enforces them and the web app mirrors them for the UI.
export interface PolicyMember {
  email: string;
  group: string;
  isAdmin: boolean;
  adminGroups: string[];
  name?: string;
  role?: string;
  managerEmail?: string | null;
}

export type GuideRole = "karyawan" | "unit" | "admin" | "owner";

export const isBOMember = (m?: { name?: string; role?: string } | null) =>
  !!m && (
    m.role?.trim().toUpperCase() === "BO" ||
    m.role?.trim().toLowerCase() === "business owner" ||
    m.name?.trim().toLowerCase() === "hanief"
  );

export const isDirectorMember = (m?: { name?: string; role?: string } | null) =>
  !!m && (
    m.role?.trim().toLowerCase().includes("direktur") ||
    m.name?.trim().toLowerCase() === "aziz"
  );

export function makePolicy(me: string, isOwner: boolean, team: readonly PolicyMember[]) {
  const mine = team.find(m => m.email === me);
  const isMember = !!mine;
  const isBO = isBOMember(mine);
  const isDirector = isDirectorMember(mine) || isOwner;
  const isAdmin = !!mine?.isAdmin;
  const groups = isAdmin ? mine!.adminGroups : [];
  /** Owner, or an admin without a unit limit. BO is kept distinct from isBoss to maintain isolation. */
  const isBoss = isOwner || (isAdmin && groups.length === 0);
  const isManager = isOwner || isAdmin || isBO;
  const manages = (group: string) => isAdmin && !!group && groups.includes(group);
  const target = (email: string) => team.find(m => m.email === email);

  /** Manage someone's tasks and profile:
   *  - Superadmin (Hellens / isOwner): full access to manage anyone.
   *  - BO only connects with Director (Aziz) and self.
   *  - Other members cannot manage BO; only Director, Superadmin, and BO can manage BO.
   *  - Boss anyone; unit admin only ordinary members of their units.
   */
  const canManage = (email: string) => {
    if (isOwner) return true;
    if (isBO) {
      if (email === me) return true;
      const t = target(email);
      return isDirectorMember(t);
    }
    const t = target(email);
    if (isBOMember(t)) {
      return email === me || isDirector;
    }
    if (isBoss) return true;
    return !!t && isAdmin && !t.isAdmin && manages(t.group);
  };

  /** Visibility:
   *  - Superadmin (Hellens / isOwner): full visibility of everyone.
   *  - BO only sees Director (Aziz) and self.
   *  - Other members cannot see BO; only Director, Superadmin, and BO can see BO.
   */
  const canSee = (email: string) => {
    if (isOwner) return true;
    if (isBO) {
      if (email === me) return true;
      const t = target(email);
      return isDirectorMember(t);
    }
    const t = target(email);
    if (isBOMember(t)) {
      return email === me || isDirector;
    }
    return canManage(email) || (isMember && me === email);
  };

  /** Superadmin: the owner account or BO. */
  const isSuper = isOwner || isBO;
  const canCreateMember = () => isSuper;
  /** `patch` lists the fields being changed. Everyone else who manages a person may only fix their name and title. */
  const canEditMember = (email: string, patch: { name?: string; role?: string; group?: string; isAdmin?: boolean; adminGroups?: string[]; managerEmail?: string | null }) => {
    if (isSuper) return true;
    return canManage(email) && Object.keys(patch).every(k => k === "name" || k === "role");
  };
  /** Which guide this account reads (and confirms). */
  const guideRole = (): GuideRole => isBO ? "owner" : isOwner ? "owner" : isBoss ? "admin" : isAdmin ? "unit" : "karyawan";
  return { me, isOwner, isSuper, isBO, isDirector, guideRole, isMember, isAdmin, isBoss, isManager, groups, manages, canManage, canSee, canCreateMember, canEditMember };
}
export type Policy = ReturnType<typeof makePolicy>;


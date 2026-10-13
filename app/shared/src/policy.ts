// Who may see and change what. Pure functions so the server enforces them and the web app mirrors them for the UI.
export interface PolicyMember {
  email: string;
  group: string;
  isAdmin: boolean;
  adminGroups: string[];
  name?: string;
  role?: string;
  level?: string;
  jobdesk?: string;
  accountType?: string;
  canCreateProject?: boolean;
  canCommentAllProjects?: boolean;
  allowedCommentProjectIds?: string[];
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

export const isProjectManagerMember = (m?: { name?: string; role?: string; level?: string } | null) =>
  !!m && (
    (!!m.role && /project manager|pm\b/i.test(m.role)) ||
    (!!m.level && /project manager/i.test(m.level)) ||
    (!!m.name && /vero/i.test(m.name))
  );

export function makePolicy(me: string, isOwner: boolean, team: readonly PolicyMember[]) {
  const mine = team.find(m => m.email === me);
  const isMember = !!mine;
  const isBO = isBOMember(mine);
  const isDirector = isDirectorMember(mine) || isOwner;
  const isPM = isProjectManagerMember(mine);
  const isClient = mine?.accountType === "client";
  const isAdmin = !!mine?.isAdmin;
  const groups = isAdmin ? mine!.adminGroups : [];
  /** Owner, or an admin without a unit limit. BO is kept distinct from isBoss to maintain isolation. */
  const isBoss = isOwner || (isAdmin && groups.length === 0);
  const isManager = isOwner || isAdmin || isBO || isPM;
  const manages = (group: string) => isAdmin && !!group && groups.includes(group);
  const target = (email: string) => team.find(m => m.email === email);

  /** Manage someone's tasks and profile:
   *  - Superadmin (Hellens / isOwner): full access to manage anyone.
   *  - BO only connects with Director (Aziz) and self.
   *  - Vero (Project Manager) can assign & manage tasks across all entities (HCS, HCM, etc.) & self.
   *  - Other members cannot manage BO; only Director, Superadmin, and BO can manage BO.
   *  - Boss anyone; unit admin only ordinary members of their units.
   */
  const canManage = (email: string) => {
    if (isOwner) return true;
    if (isBO) {
      const t = target(email);
      return isDirectorMember(t);
    }
    const t = target(email);
    if (isBOMember(t)) {
      return isDirector;
    }
    if (isPM) return email === me || !isBOMember(t);
    if (isBoss) return true;
    if (t?.managerEmail === me) return true;
    return !!t && isAdmin && !t.isAdmin && manages(t.group);
  };

  /** Who may approve someone's self-created task: a superior who manages them (cannot approve own task). */
  const canApproveTask = (email: string) => email !== me && canManage(email);

  /** Does this user need approval when creating a task for themselves?
   *  Tasks can be added instantly without superior approval.
   */
  const needsTaskApproval = () => false;

  /** Visibility:
   *  - Superadmin (Hellens / isOwner): full visibility of everyone.
   *  - Project Manager: sees all team members to coordinate cross-entity projects.
   *  - BO only sees Director (Aziz) and self.
   *  - Other members cannot see BO; only Director, Superadmin, and BO can see BO.
   */
  const canSee = (email: string) => {
    if (email === me) return true;
    if (isOwner || isPM) return true;
    if (isBO) {
      const t = target(email);
      return isDirectorMember(t);
    }
    const t = target(email);
    if (isBOMember(t)) {
      return isDirector;
    }
    return canManage(email) || (isMember && me === email);
  };

  /** Superadmin: the owner account or BO. */
  const isSuper = isOwner || isBO;
  const canCreateMember = () => isSuper;

  /** Project creation switch: Managers (Owner, Admin, PM, BO) or members with canCreateProject switch enabled */
  const canCreateProject = () => isManager || !!mine?.canCreateProject;

  /** Comment authorization on tasks: Creator, Director (Aziz), Assignee, Supervisor, or Superadmin switch */
  const canCommentTask = (task: { fromAdmin?: string | null; email: string; projectId?: string | null }) => {
    if (isSuper || isDirector || isOwner) return true;
    if (task.email === me) return true;
    if (task.fromAdmin && (task.fromAdmin === me || (mine?.name && task.fromAdmin === mine.name))) return true;
    if (canManage(task.email)) return true;
    if (mine?.canCommentAllProjects) return true;
    if (task.projectId && mine?.allowedCommentProjectIds?.includes(task.projectId)) return true;
    return false;
  };

  /** `patch` lists the fields being changed. Everyone else who manages a person may only fix their name and title. */
  const canEditMember = (email: string, patch: Record<string, unknown>) => {
    if (isSuper) return true;
    return canManage(email) && Object.keys(patch).every(k => k === "name" || k === "role");
  };

  /** Which guide this account reads (and confirms). */
  const guideRole = (): GuideRole => isBO ? "owner" : isOwner ? "owner" : isBoss ? "admin" : isPM ? "admin" : isAdmin ? "unit" : "karyawan";
  return {
    me, isOwner, isSuper, isBO, isDirector, isPM, isClient, guideRole, isMember, isAdmin, isBoss, isManager,
    groups, manages, canManage, canSee, canCreateMember, canEditMember, canApproveTask, needsTaskApproval,
    canCreateProject, canCommentTask
  };
}
export type Policy = ReturnType<typeof makePolicy>;



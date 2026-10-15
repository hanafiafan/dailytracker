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

export const isBOMember = (m?: { name?: string; role?: string; level?: string; email?: string } | null) =>
  !!m && (
    m.role?.trim().toUpperCase() === "BO" ||
    m.role?.trim().toLowerCase() === "business owner" ||
    m.role?.trim().toLowerCase() === "brand owner" ||
    m.level?.trim().toLowerCase() === "brand owner" ||
    m.level?.trim().toUpperCase() === "BO" ||
    /brand owner/i.test(m.role ?? "") ||
    /brand owner/i.test(m.level ?? "") ||
    /hanief/i.test(m.name ?? "") ||
    /hanief/i.test(m.email ?? "")
  );

export const isDirectorMember = (m?: { name?: string; role?: string; email?: string } | null) =>
  !!m && (
    m.role?.trim().toLowerCase().includes("direktur") ||
    /aziz/i.test(m.name ?? "") ||
    /aziz/i.test(m.email ?? "")
  );

export const isProjectManagerMember = (m?: { name?: string; role?: string; level?: string; email?: string } | null) =>
  !!m && (
    (!!m.role && /project manager|pm\b/i.test(m.role)) ||
    (!!m.level && /project manager/i.test(m.level)) ||
    /vero/i.test(m.name ?? "") ||
    /vero/i.test(m.email ?? "")
  );

export function makePolicy(me: string, isOwner: boolean, team: readonly PolicyMember[]) {
  const mine = team.find(m => m.email === me);
  const isMember = !!mine;
  const isBO = isBOMember(mine);
  const isDirector = isDirectorMember(mine);
  const isPM = isProjectManagerMember(mine);
  const isClient = mine?.accountType === "client";
  const isAdmin = !!mine?.isAdmin;
  const groups = isAdmin ? mine!.adminGroups : [];
  /** Owner, or an admin without a unit limit. BO is kept distinct from isBoss to maintain isolation. */
  const isBoss = !isBO && (isOwner || (isAdmin && groups.length === 0));
  const isManager = isOwner || isAdmin || isBO || isPM;
  const manages = (group: string) => isAdmin && !!group && groups.includes(group);
  const target = (email: string) => team.find(m => m.email === email);

  /** Manage someone's tasks and profile:
   *  - Superadmin (Hellens / isOwner): full access to manage anyone.
   *  - Brand Owner (Hanief): ranks below Superadmin and above Admin. Controls Director (Aziz) & self.
   *    Nobody below Superadmin can manage BO.
   *  - Vero (Project Manager) can assign & manage tasks across all entities (HCS, HCM, etc.) & self.
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
      // BO ranks above Admin and Director; only Superadmin (isOwner) can manage BO
      return false;
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
   *  - Superadmin (Hellens / isOwner) & PM: full visibility of everyone.
   *  - Brand Owner (Hanief): full visibility of all active projects, tasks, and members (ranks below Superadmin and above Admin).
   *  - Other members cannot see BO; only Director, Superadmin, and BO can see BO.
   */
  const canSee = (email: string) => {
    if (email === me) return true;
    if (isOwner || isPM || isBO) return true;
    const t = target(email);
    if (isBOMember(t)) {
      return isDirector || isOwner;
    }
    return canManage(email) || (isMember && me === email);
  };

  /** Superadmin: the owner account (Hellens). Brand Owner is separated from Superadmin. */
  const isSuper = isOwner;
  const canCreateMember = () => isSuper;

  /** Project creation switch: Managers (Owner, Admin, PM, BO) or members with canCreateProject switch enabled */
  const canCreateProject = () => isManager || !!mine?.canCreateProject;

  /** Comment authorization on tasks: Creator, Director (Aziz), Assignee, Supervisor, BO, or Superadmin switch */
  const canCommentTask = (task: { fromAdmin?: string | null; email: string; projectId?: string | null }) => {
    if (isSuper || isDirector || isOwner || isBO) return true;
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
    if (isBO) {
      const t = target(email);
      return (email === me || isDirectorMember(t)) && Object.keys(patch).every(k => k === "name" || k === "role");
    }
    return canManage(email) && Object.keys(patch).every(k => k === "name" || k === "role");
  };

  /** Which guide this account reads (and confirms). */
  const guideRole = (): GuideRole => isOwner ? "owner" : isBO ? "owner" : isBoss ? "admin" : isPM ? "admin" : isAdmin ? "unit" : "karyawan";

  /** Who this person can start a direct message with:
   *  - Superadmin & Director: anyone on the team.
   *  - BO: only Director and Superadmin.
   *  - Client: only team members who manage them.
   *  - Regular members: any other member except BO (who is isolated) and except Client.
   */
  const canChatWith = (email: string) => {
    if (email === me) return false;
    const other = target(email);
    if (!other) return false;
    if (isOwner || isDirector) return true;
    if (isBO) return isDirectorMember(other);
    if (isBOMember(other)) return isDirector || isOwner;
    if (isClient) return canManage(email) || other.email === mine?.managerEmail;
    if (other.accountType === "client") return canManage(email);
    return true;
  };

  return {
    me, isOwner, isSuper, isBO, isDirector, isPM, isClient, guideRole, isMember, isAdmin, isBoss, isManager,
    groups, manages, canManage, canSee, canCreateMember, canEditMember, canApproveTask, needsTaskApproval,
    canCreateProject, canCommentTask, canChatWith
  };
}
export type Policy = ReturnType<typeof makePolicy>;



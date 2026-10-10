// Who may see and change what. Pure functions so the server enforces them and the web app mirrors them for the UI.
export interface PolicyMember { email: string; group: string; isAdmin: boolean; adminGroups: string[] }

export function makePolicy(me: string, isOwner: boolean, team: readonly PolicyMember[]) {
  const mine = team.find(m => m.email === me);
  const isMember = !!mine;
  const isAdmin = !!mine?.isAdmin;
  const groups = isAdmin ? mine!.adminGroups : [];
  /** Owner, or an admin without a unit limit. */
  const isBoss = isOwner || (isAdmin && groups.length === 0);
  const isManager = isOwner || isAdmin;
  const manages = (group: string) => isAdmin && !!group && groups.includes(group);
  const target = (email: string) => team.find(m => m.email === email);

  /** Manage someone's tasks and profile: boss anyone; unit admin only ordinary members of their units. */
  const canManage = (email: string) => {
    if (isBoss) return true;
    const t = target(email);
    return !!t && isAdmin && !t.isAdmin && manages(t.group);
  };
  const canSee = (email: string) => canManage(email) || (isMember && me === email);
  /** Superadmin (the owner account): the only one who adds, removes, moves, reorders, promotes people or changes their unit. */
  const isSuper = isOwner;
  const canCreateMember = () => isSuper;
  /** `patch` lists the fields being changed. Everyone else who manages a person may only fix their name and title. */
  const canEditMember = (email: string, patch: { name?: string; role?: string; group?: string; isAdmin?: boolean; adminGroups?: string[] }) => {
    if (isSuper) return true;
    return canManage(email) && Object.keys(patch).every(k => k === "name" || k === "role");
  };
  return { me, isOwner, isSuper, isMember, isAdmin, isBoss, isManager, groups, manages, canManage, canSee, canCreateMember, canEditMember };
}
export type Policy = ReturnType<typeof makePolicy>;

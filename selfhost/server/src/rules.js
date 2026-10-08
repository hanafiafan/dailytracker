// Access rules, ported from the Firestore rules of the Firebase version (pwa/firestore.rules).
//  - Owner: full control. Admin without units ("Semua unit"): full control.
//  - Unit admin (adminGroups = ["HCS"]): sees and manages ordinary members of those units only.
//  - Member: sees and works on their own tasks only.
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const changedKeys = (before, after) => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(k => differs((before || {})[k], (after || {})[k]));
const onlyIn = (keys, allowed) => keys.every(k => allowed.includes(k));

const ITEM_UPDATE = ["status", "startedAt", "doneAt", "returnedAt", "proof", "report", "reportAt"];

export function makeRules(store, ownerEmail) {
  const owner = ownerEmail.toLowerCase();
  const teamOf = e => (store.get("team/" + e) || {}).data;

  // `me` = signed-in email. Returns { owner, can(op, path, before, after) }.
  return me => {
    const my = teamOf(me);
    const isOwner = me === owner, isMember = !!my, isAdmin = isMember && my.isAdmin === true;
    const groups = isAdmin && Array.isArray(my.adminGroups) ? my.adminGroups : [];
    const isBoss = isOwner || (isAdmin && !groups.length);
    const manages = g => isAdmin && !!g && groups.includes(g);
    const canManage = email => {
      if (isBoss) return true;
      const t = isAdmin && teamOf(email);
      return !!t && t.isAdmin !== true && manages(t.group || "");
    };
    const canSee = email => canManage(email) || (isMember && me === email);

    function can(op, path, before, after) {
      const [a, email, b, id] = path.split("/");
      const read = op === "get" || op === "list";
      before = before || {}; after = after || {};

      if (a === "team" && email && !b) {                        // team/<email>
        if (read) return isOwner || isMember;
        if (op === "create") return isBoss || (manages(after.group || "") && !("isAdmin" in after) && !("adminGroups" in after));
        if (op === "delete") return isBoss || (manages(before.group || "") && before.isAdmin !== true);
        const ck = changedKeys(before, after);               // update
        return isBoss
          || (manages(before.group || "") && before.isAdmin !== true && manages(after.group || "") && !ck.some(k => k === "isAdmin" || k === "adminGroups"))
          || (isMember && me === email && onlyIn(ck, ["name", "role", "photo", "seenAt"]));
      }
      if (a === "team" && !email) return read && (isOwner || isMember);   // list team

      if (a === "tasks" && email && !b) {                       // tasks/<email> (routines, askAt)
        if (read) return canSee(email);
        if (canManage(email)) return true;
        if (!(isMember && me === email)) return false;
        if (op === "create") return onlyIn(Object.keys(after), ["askAt"]);
        if (op === "update") return onlyIn(changedKeys(before, after), ["askAt"]);
        return false;
      }
      if (a === "tasks" && b === "items") {                     // tasks/<email>/items[/<id>]
        if (read) return canSee(email);
        if (canManage(email)) return true;
        if (!(isMember && me === email)) return false;
        if (op === "create") return after.by === "self" || (after.by === "owner" && "routine" in after); // routines are created by the member's app
        if (op === "update") return onlyIn(changedKeys(before, after), ITEM_UPDATE);
        if (op === "delete") return before.by === "self";
        return false;
      }
      if (a === "proofs" && b === "items") return canSee(email) || (!read && isMember && me === email) || (!read && canManage(email));

      return false;
    }
    return { owner: isOwner, can, canManage, isManager: isOwner || isAdmin };
  };
}

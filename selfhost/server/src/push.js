// Web Push sending and the "who gets notified" logic.
import webpush from "web-push";

export function makePush(store, ownerEmail, appUrl) {
  // VAPID keys are generated once and kept in the database.
  let pub = store.meta.get("vapid_pub"), priv = store.meta.get("vapid_priv");
  if (!pub) { ({ publicKey: pub, privateKey: priv } = webpush.generateVAPIDKeys()); store.meta.set("vapid_pub", pub); store.meta.set("vapid_priv", priv); }
  webpush.setVapidDetails("mailto:" + ownerEmail, pub, priv);

  async function send(emails, title, body, tag) {
    const payload = JSON.stringify({ title, body, tag: tag || "", url: appUrl });
    for (const email of new Set(emails)) {
      for (const d of store.push.of(email)) {
        try { await webpush.sendNotification(d.sub, payload, { TTL: 86400, urgency: "high" }); }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) store.push.drop(d.endpoint); else console.warn("push", e.statusCode || e.message); }
      }
    }
  }
  // The owner, admins of all units, and admins of this person's unit.
  function managersOf(email) {
    const group = ((store.get("team/" + email) || { data: {} }).data.group) || "";
    const out = [ownerEmail.toLowerCase()];
    for (const t of store.list("team")) {
      if (!t.data.isAdmin || t.id === email) continue;
      const g = Array.isArray(t.data.adminGroups) ? t.data.adminGroups : [];
      if (!g.length || g.includes(group)) out.push(t.id);
    }
    return out;
  }
  const nameOf = email => ((store.get("team/" + email) || { data: {} }).data.name) || email;
  return { publicKey: pub, send, managersOf, nameOf };
}

// Called after every successful write; mirrors the Cloud Functions triggers of the Firebase version.
export function onWrite(push, today, path, before, after) {
  const [a, email, b, id] = path.split("/");
  if (!after) return;
  if (a === "tasks" && b === "items") {
    if (!before) {
      if (after.by === "owner" && !after.routine) push.send([email], "Tugas baru", after.title + (after.date === today() ? "" : ` (${after.date})`), "new-" + id);
    } else if (after.returnedAt && after.returnedAt !== before.returnedAt && after.status !== "done") {
      push.send([email], "Tugas dikembalikan", `${after.title}. Cek catatan dari admin.`, "back-" + id);
    } else if (before.status !== "done" && after.status === "done") {
      push.send(push.managersOf(email), `${push.nameOf(email)} menyelesaikan tugas`, after.title, "done-" + id);
    }
  } else if (a === "tasks" && !b && after.askAt && after.askAt !== (before || {}).askAt) {
    push.send(push.managersOf(email), `${push.nameOf(email)} minta tugas`, "Semua tugasnya sudah selesai.", "ask-" + email);
  }
}

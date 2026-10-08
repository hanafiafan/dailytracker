// What gets announced, to whom: a push to the devices and a message in the in-app inbox (the bell).
import type { Db } from "./db/index.js";
import type { tasks } from "./db/schema.js";
import type { Bus } from "./events.js";
import type { Push } from "./push.js";
import { deliverInbox } from "./services.js";
import { wib } from "@shared/time";

type TaskRow = typeof tasks.$inferSelect;

export function createNotify(push: Push, db: Db, bus: Bus, nameOf: (email: string) => string) {
  const deliver = (to: string[], kind: string, taskId: string | null, title: string, body: string, tag: string) => {
    deliverInbox(db, bus, to, kind, taskId, body ? `${title}: ${body}` : title);
    return push.send(to, title, body, tag);
  };
  return {
    newTask: (t: TaskRow) =>
      deliver([t.email], "task_new", t.id, "Tugas baru", t.title + (t.date === wib().date ? "" : ` (${t.date})`), "new-" + t.id),
    assigned: (t: TaskRow, by: string) =>
      deliver([t.email], "assigned", t.id, "Tugas dialihkan ke kamu", `${t.title} (oleh ${by})`, "assign-" + t.id),
    returned: (t: TaskRow) =>
      deliver([t.email], "returned", t.id, "Tugas dikembalikan", `${t.title}. Cek catatan dari admin.`, "back-" + t.id),
    done: (t: TaskRow, by: string) =>
      deliver(push.managersOf(t.email).filter(e => e !== by), "done", t.id, `${nameOf(t.email)} menyelesaikan tugas`, t.title, "done-" + t.id),
    ask: (email: string) =>
      deliver(push.managersOf(email), "ask", null, `${nameOf(email)} minta tugas`, "Semua tugasnya sudah selesai.", "ask-" + email),
    mention: (to: string[], t: TaskRow, by: string, text: string) =>
      deliver(to, "mention", t.id, `${by} menyebutmu di "${t.title}"`, text.slice(0, 120), "mention-" + t.id),
    commented: (to: string[], t: TaskRow, by: string, text: string) =>
      deliver(to, "comment", t.id, `Komentar baru di "${t.title}"`, `${by}: ${text.slice(0, 120)}`, "cmt-" + t.id),
  };
}
export type Notify = ReturnType<typeof createNotify>;

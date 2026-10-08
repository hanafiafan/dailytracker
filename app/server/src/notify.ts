// What gets announced, to whom. Called by the routes after a successful write.
import type { Push } from "./push.js";
import type { tasks } from "./db/schema.js";
import { wib } from "@shared/time";

type TaskRow = typeof tasks.$inferSelect;

export const createNotify = (push: Push, nameOf: (email: string) => string) => ({
  newTask: (t: TaskRow) =>
    push.send([t.email], "Tugas baru", t.title + (t.date === wib().date ? "" : ` (${t.date})`), "new-" + t.id),
  returned: (t: TaskRow) =>
    push.send([t.email], "Tugas dikembalikan", `${t.title}. Cek catatan dari admin.`, "back-" + t.id),
  done: (t: TaskRow, by: string) =>
    push.send(push.managersOf(t.email).filter(e => e !== by), `${nameOf(t.email)} menyelesaikan tugas`, t.title, "done-" + t.id),
  ask: (email: string) =>
    push.send(push.managersOf(email), `${nameOf(email)} minta tugas`, "Semua tugasnya sudah selesai.", "ask-" + email),
});
export type Notify = ReturnType<typeof createNotify>;

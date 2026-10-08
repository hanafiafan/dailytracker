// In-process scheduler: deadline reminders and the 08:00 WIB morning reminder. The team lives in WIB (UTC+7, no DST).
export const wib = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
};
const atMs = (date, hm) => Date.parse(`${date}T${hm}:00+07:00`);

export async function runReminders(store, push, now = Date.now()) {
  const { date, hour, minute } = wib(new Date(now));
  const items = store.itemsOn(date);

  // Deadline: once at 30 minutes before, once when overdue.
  for (const it of items) {
    const t = it.data;
    if (t.status === "done" || !t.due) continue;
    const dl = atMs(date, t.due);
    if (now > dl && !t.remLate) {
      store.set(it.path, { ...t, remLate: true });
      await push.send([it.email], "Tugas terlambat", `${t.title} (tenggat ${t.due})`, "late-" + it.id);
    } else if (dl > now && dl - now <= 30 * 60000 && !t.remDue && !t.remLate) {
      store.set(it.path, { ...t, remDue: true });
      await push.send([it.email], "Tenggat sebentar lagi", `${t.title} jam ${t.due}`, "due-" + it.id);
    }
  }

  // Morning: unfinished tasks today, plus routines the app has not created yet.
  if (hour !== 8 || minute >= 15 || store.meta.get("morning") === date) return;
  store.meta.set("morning", date);
  const dow = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  for (const m of store.list("team")) {
    if (m.data.isAdmin || !store.push.of(m.id).length) continue;
    const mine = items.filter(i => i.email === m.id);
    const ids = new Set(mine.map(i => i.id));
    const routines = ((store.get("tasks/" + m.id) || { data: {} }).data.routines) || [];
    const extra = routines.filter(r => (r.days || []).includes(dow) && !ids.has(`r-${r.id}-${date}`)).length;
    const n = mine.filter(i => i.data.status !== "done").length + extra;
    if (n) await push.send([m.id], "Selamat pagi", `Kamu punya ${n} tugas hari ini.`, "morning-" + date);
  }
}

export function startScheduler(store, push) {
  let last = "";
  setInterval(() => {
    const { date, hour, minute } = wib();
    const key = `${date}T${hour}:${minute}`;
    if (minute % 15 || key === last) return;
    last = key;
    store.session.purge();
    runReminders(store, push).catch(e => console.error("reminders", e));
  }, 30000).unref();
}

// Date helpers shared by server and web. Dates are "YYYY-MM-DD" and times "HH:MM" in WIB (UTC+7, no DST).
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, m! - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };

/** Today's date and clock in WIB, independent of the machine's time zone. */
export function wib(now: Date | number = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}
/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export const weekday = (date: string) => new Date(`${date}T12:00:00+07:00`).getUTCDay();
/** Epoch ms of a task's wall-clock time ("YYYY-MM-DD" + "HH:MM", WIB). */
export const atMs = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+07:00`);

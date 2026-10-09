import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays, parseYmd, ymd } from "@shared/time";
import { DAYN, STATUS, today } from "../lib/format";
import { PRIORITY_RANK, weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar, Empty } from "./ui";

/** Phone version of the calendar: a week strip to pick the day, then that day's tasks in time order. */
export function Agenda({ days, tasks }: { days: string[]; tasks: TaskDTO[] }) {
  const { date, setDate, openTask, newTask } = useUi();
  const { member, project } = useViewer();
  const t0 = today();
  const day = days.includes(date) ? date : days[0]!;
  const list = tasks.filter(t => t.date === day).sort((a, b) => (a.start ?? a.due ?? "99").localeCompare(b.start ?? b.due ?? "99") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return (
    <div className="agenda">
      <MonthGrid tasks={tasks} day={day} onPick={setDate} />
      <div className="bc">
        <div className="bc-h"><h2>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" }).format(new Date(day + "T12:00:00"))}</h2><span className="tagcount">{list.length} tugas</span>
          <button className="btn small" onClick={() => newTask({ date: day })}><Plus size={14} />Tugas</button></div>
        <ul className="agl">
          {list.map(t => { const m = member(t.email), p = project(t.projectId); return (
            <li key={t.id}>
              <button className="agi" data-c={p?.color} onClick={() => openTask(t.id)}>
                <span className="agt">{t.start ? <>{t.start}<small>{t.due ?? ""}</small></> : t.due ? <>s/d<small>{t.due}</small></> : <small>Seharian</small>}</span>
                <span className="agm"><b className="clamp2">{t.title}</b><small className="muted clamp1">{m?.name ?? t.email}{p ? " · " + p.name : ""}</small></span>
                <span className="agr">{m && <Avatar m={m} />}<em className={"stpill " + t.status}>{STATUS[t.status]}</em></span>
              </button>
            </li>); })}
        </ul>
        {!list.length && <Empty art="calendar" title="Tidak ada tugas hari ini">Ketuk Tugas untuk menambah.</Empty>}
      </div>
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
/** Month of circles: lime = everything done, ringed = open tasks, black = the day you picked, dashed = nothing planned. */
function MonthGrid({ tasks, day, onPick }: { tasks: TaskDTO[]; day: string; onPick: (d: string) => void }) {
  const t0 = today();
  const first = parseYmd(day); first.setDate(1);
  const start = weekStart(ymd(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || d.slice(0, 7) === ymd(first).slice(0, 7));
  const by = new Map<string, { n: number; done: number }>();
  for (const t of tasks) { const e = by.get(t.date) ?? { n: 0, done: 0 }; e.n++; if (t.status === "done") e.done++; by.set(t.date, e); }
  const shift = (k: number) => { const d = parseYmd(day); d.setDate(1); d.setMonth(d.getMonth() + k); onPick(ymd(d)); };
  return (
    <section className="mmonth" aria-label="Kalender bulan">
      <div className="mm-h"><h2>{MONTH.format(first)}</h2><span><button className="rbtn" onClick={() => shift(-1)} aria-label="Bulan lalu"><ChevronLeft size={18} /></button><button className="rbtn" onClick={() => shift(1)} aria-label="Bulan depan"><ChevronRight size={18} /></button></span></div>
      <div className="mm-g">
        {["S", "S", "R", "K", "J", "S", "M"].map((d, i) => <b key={i}>{d}</b>)}
        {cells.map(d => { const e = by.get(d); const cls = "mm-d" + (d.slice(0, 7) !== ymd(first).slice(0, 7) ? " off" : "") + (e ? (e.done === e.n ? " done" : " open") : " none") + (d === t0 ? " today" : "") + (d === day ? " sel" : "");
          return <button key={d} className={cls} onClick={() => onPick(d)} aria-label={`${d}${e ? `, ${e.n} tugas, ${e.done} selesai` : ", tidak ada tugas"}`} aria-pressed={d === day}>{Number(d.slice(8))}</button>; })}
      </div>
    </section>
  );
}

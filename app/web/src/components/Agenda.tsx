import { Plus } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { DAYN, STATUS, today } from "../lib/format";
import { PRIORITY_RANK } from "../lib/tasks";
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
      <div className="daystrip" role="group" aria-label="Pilih hari">
        {days.map((d, i) => {
          const n = tasks.filter(t => t.date === d).length;
          return <button key={d} aria-pressed={d === day} className={d === t0 ? "today" : ""} onClick={() => setDate(d)} aria-label={`${d}, ${n} tugas`}><small>{DAYN[(i + 1) % 7]}</small><b>{Number(d.slice(8))}</b><i className={n ? "has" : ""}>{n || ""}</i></button>;
        })}
      </div>
      <div className="bc">
        <div className="bc-h"><h2>{day === t0 ? "Hari ini" : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00"))}</h2>
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

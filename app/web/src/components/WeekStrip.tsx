import type { TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { DAYN, today } from "../lib/format";
import { weekStart } from "../lib/tasks";

/** Seven day bubbles for the week of `date`; each shows how many tasks are done. Tap one to jump to that day. */
export function WeekStrip({ date, tasks, onPick }: { date: string; tasks: TaskDTO[]; onPick: (d: string) => void }) {
  const wk = weekStart(date), t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  return (
    <div className="weekstrip" role="group" aria-label="Minggu ini">
      {days.map((d, i) => {
        const l = tasks.filter(t => t.date === d), done = l.filter(t => t.status === "done").length, p = l.length ? done / l.length : 0;
        return (
          <button key={d} className={"wd" + (d === date ? " sel" : "") + (d === t0 ? " today" : "")} onClick={() => onPick(d)} aria-pressed={d === date}
            aria-label={`${DAYN[(i + 1) % 7]} ${Number(d.slice(8))}: ${l.length ? `${done} dari ${l.length} selesai` : "tidak ada tugas"}`}>
            <small>{DAYN[(i + 1) % 7]}</small>
            <b>{Number(d.slice(8))}</b>
            <span className="wbar"><i style={{ height: `${Math.max(l.length ? 12 : 0, p * 100)}%` }} /></span>
            <em>{l.length ? `${done}/${l.length}` : "–"}</em>
          </button>
        );
      })}
    </div>
  );
}

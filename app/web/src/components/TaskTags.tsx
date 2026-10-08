import type { TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { dur, fmtShort, fmtTime } from "../lib/format";
import { PRIORITY_LABEL, subtaskProgress } from "../lib/tasks";
import { useViewer } from "../lib/viewer";

export function TimeTags({ t, compact }: { t: TaskDTO; compact?: boolean }) {
  const now = Date.now();
  const dl = t.due ? atMs(t.date, t.due) : null, st = t.start ? atMs(t.date, t.start) : null;
  return <>
    {(st || dl) && <span className="tag due">⏰ {t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due}</span>}
    {t.status === "done" && t.doneAt && dl
      ? (t.doneAt - dl <= 60000 ? <span className="tag on">Tepat waktu</span> : <span className="tag late">Telat {dur(t.doneAt - dl)}</span>)
      : t.status !== "done" && dl && now > dl ? <span className="tag hot">Terlambat {dur(now - dl)}</span>
      : t.status === "todo" && st && now > st ? <span className="tag late">Belum mulai · lewat {dur(now - st)}</span> : null}
    {!compact && t.startedAt && <span className="tag off">Mulai {fmtTime(t.startedAt)}</span>}
    {t.status === "done" && t.doneAt && <span className="tag off">Selesai {fmtTime(t.doneAt)}</span>}
  </>;
}

/** Everything worth glancing at on a task: priority, project, labels, checklist, flags. */
export function TaskMeta({ t, isLate, time = true, compact }: { t: TaskDTO; isLate?: boolean; time?: boolean; compact?: boolean }) {
  const { project, label } = useViewer();
  const p = project(t.projectId), sp = subtaskProgress(t);
  return (
    <div className="meta">
      {time && <TimeTags t={t} compact={compact} />}
      {(t.priority === "high" || t.priority === "urgent") && <span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span>}
      {p && <span className="tag proj" data-c={p.color}>{p.name}</span>}
      {t.labelIds.map(id => { const l = label(id); return l ? <span key={id} className="tag proj" data-c={l.color}>#{l.name}</span> : null; })}
      {sp.total > 0 && <span className="tag off">☑ {sp.done}/{sp.total}</span>}
      {t.comments.length > 0 && <span className="tag off">💬 {t.comments.length}</span>}
      {isLate && <span className="tag late">Dari {fmtShort(t.date)}</span>}
      {t.routineId && <span className="tag rut">Rutin</span>}
      {t.by === "self" && <span className="tag off">Dibuat sendiri</span>}
      {t.returnedAt && t.status !== "done" && <span className="tag late">Dikembalikan admin</span>}
      {!compact && t.status !== "done" && t.needProof && <span className="tag off">Wajib bukti</span>}
      {t.status === "done" && (t.proofAt ? <span className="tag on">✓ Ada bukti</span> : t.needProof ? <span className="tag late">Tanpa bukti</span> : null)}
    </div>
  );
}

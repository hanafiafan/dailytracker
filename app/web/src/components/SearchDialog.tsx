import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { addDays } from "@shared/time";
import { STATUS, fmtShort, today } from "../lib/format";
import { useTasks } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

/** Ctrl/⌘+K: find any task you can see by title, person, project, or label. */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { member, project, label } = useViewer();
  const { openTask } = useUi();
  const tasks = useTasks(addDays(today(), -60), true).data ?? [];
  const [q, setQ] = useState(""), [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hay = (t: (typeof tasks)[number]) => [t.title, t.note, member(t.email)?.name, project(t.projectId)?.name, ...t.labelIds.map(l => label(l)?.name)].join(" ").toLowerCase();
    return (s ? tasks.filter(t => s.split(/\s+/).every(w => hay(t).includes(w))) : tasks.filter(t => t.status !== "done")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [q, tasks, member, project, label]);
  const go = (id: string) => { onClose(); openTask(id); };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog cmdk" role="dialog" aria-label="Cari tugas">
        <div className="chips" style={{ flexWrap: "nowrap" }}><Search size={18} />
          <input ref={ref} className="input" placeholder="Cari tugas, orang, proyek, atau label…" value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && hits[sel]) go(hits[sel]!.id);
            }} />
        </div>
        <ul>
          {hits.map((t, i) => (
            <li key={t.id}><button aria-selected={i === sel} onClick={() => go(t.id)} onMouseEnter={() => setSel(i)}>
              <span style={{ flex: 1, minWidth: 0 }}><b>{t.title}</b><small className="muted" style={{ display: "block" }}>{member(t.email)?.name} · {fmtShort(t.date)}{project(t.projectId) ? " · " + project(t.projectId)!.name : ""}</small></span>
              <span className={"tag " + (t.status === "done" ? "on" : "off")}>{STATUS[t.status]}</span>
            </button></li>
          ))}
          {!hits.length && <li className="empty">Tidak ada tugas yang cocok.</li>}
        </ul>
      </div>
    </>
  );
}

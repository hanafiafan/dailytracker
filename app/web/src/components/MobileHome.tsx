import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Bell, ChevronRight, MessageSquare, X } from "lucide-react";
import type { MemberDTO, TaskDTO } from "@shared/schemas";
import { addDays, atMs } from "@shared/time";
import { fmtShort, today } from "../lib/format";
import { PRIORITY_RANK, subtaskProgress, weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { Flow } from "./Bento";
import { Avatar, tally } from "./ui";

const stack = (people: MemberDTO[], max = 4) => (
  <span className="avatars">{people.slice(0, max).map(m => <Avatar key={m.email} m={m} />)}{people.length > max && <span className="avatar more">+{people.length - max}</span>}</span>
);

/** Phone home: greeting strip with a dismissible toast, a big lime progress card, two tiles, today's tasks as cards, the week chart, and projects. */
export function MobileHome({ all, day, date, people, manager, attention, onAttention }: {
  all: TaskDTO[]; day: TaskDTO[]; date: string; people: MemberDTO[]; manager: boolean; attention?: number; onAttention?: () => void;
}) {
  const [, go] = useLocation();
  const { member, projects, project } = useViewer();
  const { openTask, newTask } = useUi();
  const toastKey = "th-toast-" + date;
  const [toastOpen, setToast] = useState(() => { try { return sessionStorage.getItem(toastKey) !== "1"; } catch { return true; } });
  const dismiss = () => { setToast(false); try { sessionStorage.setItem(toastKey, "1"); } catch { /* private mode */ } };
  const c = tally(day), total = day.length, pct = total ? Math.round(c.done / total * 100) : 0, open = total - c.done;
  const now = Date.now();
  const late = all.filter(t => t.status !== "done" && (t.date < today() || (t.due && t.date === today() && now > atMs(t.date, t.due)))).length;
  const wk = weekStart(date), weekDone = all.filter(t => t.status === "done" && t.date >= wk && t.date <= addDays(wk, 6)).length;
  const cards = useMemo(() => day.slice().sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.start ?? a.due ?? "99").localeCompare(b.start ?? b.due ?? "99")).slice(0, 5), [day]);
  const proj = useMemo(() => projects.filter(p => !p.archived).map(p => { const l = all.filter(t => t.projectId === p.id), d = l.filter(t => t.status === "done").length; return { p, total: l.length, pct: l.length ? Math.round(d / l.length * 100) : 0 }; }).filter(x => x.total).sort((a, b) => b.total - a.total).slice(0, 8), [projects, all]);
  return (
    <div className="mhome">
      <section className="mstrip" aria-label="Orang aktif">
        {people.length > 0 && <div className="mpeople">{people.slice(0, 5).map(m => <span key={m.email} className="mdot"><Avatar m={m} /><i /></span>)}{people.length > 5 && <span className="mmore">{people.length - 5}+</span>}</div>}
        {toastOpen && total > 0 && (
          <div className="mtoast" role="status"><Bell size={16} /><span>{open ? `Ada ${open} tugas belum selesai` : "Semua tugas hari ini selesai"}</span><button aria-label="Tutup" onClick={dismiss}><X size={14} /></button></div>
        )}
      </section>

      <section className="mhero" aria-label="Progres">
        <button className="mgo" onClick={() => go("/papan")} aria-label="Buka papan"><ArrowUpRight size={20} /></button>
        <small>{date === today() ? "Progres hari ini" : "Progres " + fmtShort(date)}</small>
        <div className="mbig">{c.done}<span>/{total}</span></div>
        <p>tugas selesai · {c.doing} dikerjakan</p>
        <div className="mbarwrap"><div className="mprog"><i style={{ width: `${pct}%` }} /></div><b>{pct}%</b></div>
        {people.length > 0 && <div className="mhero-av">{stack(people, 4)}</div>}
      </section>

      <div className="mtilesrow">
        <button className="mst coral" onClick={() => go("/daftar?st=open")}><span className="mt-go"><ArrowUpRight size={16} /></span><small>Terlambat</small><b>{late}</b><em>tugas</em></button>
        <button className="mst dark" onClick={() => go("/daftar?st=done")}><span className="mt-go"><ArrowUpRight size={16} /></span><small>Selesai minggu ini</small><b>{weekDone}</b><em>tugas</em></button>
      </div>
      {manager && !!attention && onAttention && <button className="mwide" onClick={onAttention}><span><b>{attention} perlu perhatian</b><small>terlambat, perlu ditinjau, mendesak</small></span><ChevronRight size={20} /></button>}

      {manager && cards.length > 0 && <>
        <div className="msec"><h2>Tugas hari ini</h2><button onClick={() => go("/daftar")}>Lihat semua <ChevronRight size={14} /></button></div>
        <div className="mcards">{cards.map(t => {
          const m = member(t.email), p = project(t.projectId), sp = subtaskProgress(t);
          const prog = t.status === "done" ? 100 : sp.total ? Math.round(sp.done / sp.total * 100) : t.status === "doing" ? 50 : 0;
          return (
            <button key={t.id} className="mcard" data-c={p?.color} onClick={() => openTask(t.id)}>
              <b className="clamp2">{t.title}</b>
              <small className="muted clamp1">{t.start ? `${t.start}${t.due ? "–" + t.due : ""}` : t.due ? "sebelum " + t.due : "Seharian"}{p ? " · " + p.name : ""}</small>
              <span className="mrow2">{m && <Avatar m={m} />}<span className="clamp1">{m?.name ?? t.email}</span>{t.comments.length > 0 && <em><MessageSquare size={12} />{t.comments.length}</em>}<span className={"stpill " + t.status}>{t.status === "done" ? "Selesai" : t.status === "doing" ? "Dikerjakan" : "Belum"}</span></span>
              <span className="mbarwrap thin"><span className="mprog"><i style={{ width: `${prog}%` }} /></span><b>{prog}%</b></span>
            </button>);
        })}</div>
      </>}

      <Flow all={all} date={date} />

      {proj.length > 0 && <>
        <div className="msec"><h2>Proyek</h2><button onClick={() => go("/proyek")}>Semua <ChevronRight size={14} /></button></div>
        <div className="mscroll">{proj.map(({ p, total, pct: pc }, i) => (
          <button key={p.id} className={"mproj " + (i % 3 === 0 ? "lime" : i % 3 === 1 ? "dark" : "")} data-c={p.color} onClick={() => go("/proyek/" + p.id)}>
            <span className="mt-go"><ArrowUpRight size={16} /></span><small className="clamp1">{p.name}</small><b>{pc}<span>%</span></b><em>{total} tugas</em>
            <span className="mprog"><i style={{ width: `${pc}%` }} /></span>
          </button>))}</div>
      </>}
      {!manager && <button className="btn blue" style={{ height: 46 }} onClick={() => newTask()}>Tambah tugas</button>}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskDTO } from "@shared/schemas";
import { addDays, parseYmd, ymd } from "@shared/time";
import { Agenda } from "../components/Agenda";
import { Page } from "../components/Page";
import { Avatar } from "../components/ui";
import { useIsMobile } from "../lib/useMedia";
import { api, ok } from "../lib/api";
import { fmtLong, today } from "../lib/format";
import { keys, patchTaskLocally, useAction, useTasks, windowFrom } from "../lib/queries";
import { weekStart } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

const H0 = 6, H1 = 22;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const HW = 96, LW = 168, LANE = 50; // hour width, name column width, lane height (px)
interface Ev { t: TaskDTO; s: number; e: number; lane: number }
/** One person's timed tasks on a horizontal time axis: overlapping tasks go in their own lane under each other. */
function pack(tasks: TaskDTO[]): { evs: Ev[]; lanes: number } {
  const evs = tasks.map(t => {
    const s = Math.max(H0 * 60, t.start ? mins(t.start) : mins(t.due!) - 45);
    const e = Math.min(H1 * 60, Math.max(s + 30, t.start && t.due ? mins(t.due) : t.start ? s + 60 : mins(t.due!)));
    return { t, s, e, lane: 0 };
  }).sort((x, y) => x.s - y.s || y.e - x.e);
  const ends: number[] = [];
  for (const ev of evs) { let i = ends.findIndex(end => end <= ev.s); if (i < 0) i = ends.length; ends[i] = ev.e; ev.lane = i; }
  return { evs, lanes: Math.max(1, ends.length) };
}

function Event({ ev, canDrag }: { ev: Ev; canDrag: boolean }) {
  const { openTask } = useUi();
  const { project } = useViewer();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.t.id, disabled: !canDrag });
  const p = project(ev.t.projectId);
  const left = (ev.s - H0 * 60) / 60 * HW, width = Math.max(72, (ev.e - ev.s) / 60 * HW - 4);
  return (
    <button ref={setNodeRef} className={"ev" + (ev.t.status === "done" ? " done" : ev.t.status === "doing" ? " doing" : "")} data-c={p?.color ?? "lilac"}
      style={{ left: left + 2, width, top: 4 + ev.lane * LANE, height: LANE - 4, right: "auto", opacity: isDragging ? 0.35 : 1 }}
      onClick={() => openTask(ev.t.id)} title={`${ev.t.title} · ${hm(ev.s)}–${hm(ev.e)}${p ? " · " + p.name : ""}`} {...attributes} {...listeners}>
      <b style={{ WebkitLineClamp: 1 }}>{ev.t.title}</b><small>{hm(ev.s)}–{hm(ev.e)}{p ? " · " + p.name : ""}</small>
    </button>
  );
}

function Slot({ id, h, onNew }: { id: string; h: number; onNew: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className="dslot" data-over={isOver} style={{ left: (h - H0) * HW, width: HW }} onDoubleClick={onNew} />;
}

/** The selected day on one horizontal timeline, one row per person. */
function DayBoard({ date, tasks, canEdit }: { date: string; tasks: TaskDTO[]; canEdit: (t: TaskDTO) => boolean }) {
  const { team, policy, project, member } = useViewer();
  const { newTask } = useUi();
  const day = tasks.filter(t => t.date === date);
  const rows = team.filter(m => day.some(t => t.email === m.email));
  const untimed = day.filter(t => !t.start && !t.due);
  const t0 = today(), nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const width = (H1 - H0) * HW;
  return (
    <div className="week dayb">
      <div className="dayb-in" style={{ minWidth: LW + width }}>
        <div className="dayb-head"><div style={{ width: LW }} />{Array.from({ length: H1 - H0 }, (_, i) => <div key={i} style={{ width: HW }}>{String(H0 + i).padStart(2, "0")}:00</div>)}</div>
        {untimed.length > 0 && (
          <div className="dayb-row dayb-all"><div className="dayb-who" style={{ width: LW }}><small>SEHARI</small></div>
            <div className="dayb-chips"><AllDay date={date} tasks={untimed} label={t => `${member(t.email)?.name ?? ""}: ${t.title}`} /></div></div>
        )}
        {rows.map(m => {
          const { evs, lanes } = pack(day.filter(t => t.email === m.email && (t.start || t.due)));
          const mine = day.filter(t => t.email === m.email);
          return (
            <div key={m.email} className="dayb-row">
              <div className="dayb-who" style={{ width: LW }}><Avatar m={m} /><span><b className="clamp1">{m.name}</b><small>{mine.filter(t => t.status === "done").length}/{mine.length} selesai</small></span></div>
              <div className="dayb-line" style={{ width, height: Math.max(1, lanes) * LANE + 4 }}>
                {Array.from({ length: H1 - H0 }, (_, i) => <Slot key={i} id={`slot:${date}:${H0 + i}:${m.email}`} h={H0 + i} onNew={() => policy.canManage(m.email) || policy.me === m.email ? newTask({ date, emails: [m.email], start: hm((H0 + i) * 60), due: hm((H0 + i + 1) * 60) }) : undefined} />)}
                {evs.map(ev => <Event key={ev.t.id} ev={ev} canDrag={canEdit(ev.t)} />)}
                {date === t0 && nowMin >= H0 * 60 && nowMin < H1 * 60 && <div className="dnow" style={{ left: (nowMin - H0 * 60) / 60 * HW }} />}
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="empty" style={{ padding: 18 }}>Tidak ada tugas di tanggal ini. Klik dua kali di jadwal untuk membuat tugas.</p>}
      </div>
    </div>
  );
}

function AllDay({ date, tasks, label }: { date: string; tasks: TaskDTO[]; label?: (t: TaskDTO) => string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:" + date });
  const { openTask } = useUi();
  const { project } = useViewer();
  return (
    <div ref={setNodeRef} className="dayb-chips-in" style={isOver ? { background: "var(--lime)", opacity: .6 } : undefined}>
      {tasks.map(t => <AllDayChip key={t.id} t={t} label={label?.(t)} tint={project(t.projectId)?.color} onOpen={() => openTask(t.id)} />)}
    </div>
  );
}
function AllDayChip({ t, tint, label, onOpen }: { t: TaskDTO; tint?: string; label?: string; onOpen: () => void }) {
  const { policy, me } = useViewer();
  const canDrag = policy.canManage(t.email) || (me.email === t.email && t.by === "self");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !canDrag });
  return <button ref={setNodeRef} className="evchip" data-c={tint ?? "lilac"} style={{ opacity: isDragging ? 0.35 : t.status === "done" ? 0.75 : 1 }} onClick={onOpen} title={t.title} {...attributes} {...listeners}>{label ?? t.title}</button>;
}

export function CalendarPage() {
  const { me, team, policy, project } = useViewer();
  const { date, setDate, newTask } = useUi();
  const qc = useQueryClient();
  const wk = weekStart(date), days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const tq = useTasks(windowFrom(wk, today()), true);
  const [who, setWho] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }));

  const tasks = (tq.data ?? []).filter(t => !who || t.email === who);
  const move = useAction((v: { id: string; date: string; start: string | null; due: string | null }) =>
    ok(api.tasks[":id"].$patch({ param: { id: v.id }, json: { date: v.date, start: v.start, due: v.due } })), { refresh: [keys.tasks, keys.activity] });
  const canEdit = (t: TaskDTO) => policy.canManage(t.email) || (me.email === t.email && t.by === "self");

  const onEnd = (e: DragEndEvent) => {
    setDragId(null);
    const t = tasks.find(x => x.id === e.active.id), over = String(e.over?.id ?? "");
    if (!t || !over || !canEdit(t)) return;
    if (over.startsWith("day:")) {
      const d = over.slice(4);
      patchTaskLocally(qc, t.id, { date: d, start: null, due: null });
      return move.mutate({ id: t.id, date: d, start: null, due: null });
    }
    const [, d, h] = over.split(":"), startM = Number(h) * 60;
    const dur = t.start && t.due ? mins(t.due) - mins(t.start) : 60;
    const start = hm(startM), due = hm(Math.min(23 * 60 + 59, startM + dur));
    patchTaskLocally(qc, t.id, { date: d!, start, due });
    move.mutate({ id: t.id, date: d!, start, due });
  };

  const mobile = useIsMobile();
  const [side, setSide] = useState(false);
  useEffect(() => { document.querySelector(".week-head .today")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [date]);
  // mini month
  const m0 = parseYmd(date); m0.setDate(1);
  const gridStart = weekStart(ymd(m0));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const counts = useMemo(() => { const c = new Map<string, number>(); for (const t of tq.data ?? []) c.set(t.date, (c.get(t.date) ?? 0) + 1); return c; }, [tq.data]);
  const t0 = today();
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const people = team.filter(m => !m.isAdmin && policy.canSee(m.email));
  const dragged = tasks.find(t => t.id === dragId);
  const title = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

  return (
    <Page title="Kalender" sub={mobile ? undefined : fmtLong(date)} dateNav={!mobile}
      actions={<>
        {policy.isManager && <select className="input" style={{ width: "auto" }} value={who} onChange={e => setWho(e.target.value)} aria-label="Orang"><option value="">Semua orang</option>{people.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>}
      </>}>
      {mobile ? <Agenda days={days} tasks={tasks} /> : <>
      <button className="btn small calbtn" onClick={() => setSide(s => !s)} aria-expanded={side}>{side ? "Sembunyikan kalender bulan" : "Pilih tanggal"}</button>
      <div className="cal">
        <div className={"calside" + (side ? " open" : "")} style={{ display: "grid", gap: 14 }}>
          <div className="mini">
            <div className="mini-h"><button className="iconbtn" onClick={() => setDate(addDays(ymd(m0), -1))} aria-label="Bulan lalu"><ChevronLeft size={16} /></button>{title.format(m0)}<button className="iconbtn" onClick={() => setDate(addDays(ymd(m0), 32))} aria-label="Bulan depan"><ChevronRight size={16} /></button></div>
            <div className="mini-g">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map(d => <b key={d}>{d}</b>)}
              {cells.map(d => (
                <button key={d} className={(d.slice(0, 7) !== ymd(m0).slice(0, 7) ? "off " : "") + (d >= wk && d <= days[6]! ? "in-week " : "") + (d === t0 ? "today" : "")} onClick={() => setDate(d)} aria-label={d}>
                  {Number(d.slice(8))}{counts.has(d) && <i className="pip" />}
                </button>
              ))}
            </div>
          </div>
          <div className="mini"><b>Proyek</b>
            <div className="chips"><span className="tag proj" data-c="lilac">Tanpa proyek</span><PCProjects /></div>
            <p className="foot">Seret tugas ke jam lain untuk menjadwal ulang. Klik dua kali di kotak kosong untuk membuat tugas baru di jam itu. Biru = sedang dikerjakan.</p>
          </div>
        </div>
        <DndContext sensors={sensors} onDragStart={e => setDragId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDragId(null)}>
          <DayBoard date={date} tasks={tasks} canEdit={canEdit} />
          <DragOverlay>{dragged ? <div className="ev drag" data-c={project(dragged.projectId)?.color ?? "lilac"} style={{ position: "relative", height: 52 }}><b>{dragged.title}</b></div> : null}</DragOverlay>
        </DndContext>
      </div>
      </>}
    </Page>
  );
}

function PCProjects() {
  const { projects } = useViewer();
  return <>{projects.filter(p => !p.archived).map(p => <span key={p.id} className="tag proj" data-c={p.color}>{p.name}</span>)}</>;
}

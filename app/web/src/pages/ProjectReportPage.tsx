import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarRange, CheckCheck, ExternalLink, FolderKanban, History, Image as ImageIcon, ListChecks, Pencil, Plus, Printer, RotateCcw, ShieldCheck, Timer, Users } from "lucide-react";
import type { ProjectReportDTO } from "@shared/schemas";
import { CloseProject } from "../components/CloseProject";
import { ProjectSetup } from "../components/ProjectSetup";
import { Page } from "../components/Page";
import { hm } from "../components/TimeTracker";
import { Avatar, Empty, PersonLink } from "../components/ui";
import { api, ok } from "../lib/api";
import { fmtShort, host, today } from "../lib/format";
import { dayGroups, HEALTH_LABEL, pct, projectMetrics, serviceStats, type ProjectMetrics, type ServiceStat } from "../lib/projects";
import { keys, useAction, useFeed, useMeta, useProjectReport } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

type T = ProjectReportDTO["tasks"][number];
const day = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
const dayLong = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00+07:00"));
const ST = { todo: "Belum", doing: "Dikerjakan", done: "Selesai" } as const;

function Ring({ value, size = 96 }: { value: number; size?: number }) {
  return (
    <div className="pring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="var(--glass)" strokeWidth="4.5" /><circle cx="20" cy="20" r="16" fill="none" stroke="var(--d, var(--blue))" strokeWidth="4.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .6s ease" }} /></svg>
      <b style={{ fontSize: size / 4.2 }}>{value}%</b>
    </div>
  );
}

const qtyText = (n: number, unit: string) => `${n.toLocaleString("id-ID")}${unit ? " " + unit : ""}`;

const linesText = (m: ProjectMetrics) => m.lines.map(l => `${l.delivered.toLocaleString("id-ID")}/${l.target.toLocaleString("id-ID")}${l.unit ? " " + l.unit : ""}`).join(" · ");

/** Overall progress per day against the straight-line plan (percent). */
function BurnUp({ m }: { m: ProjectMetrics }) {
  const s = m.series;
  if (s.length < 2) return <Empty art="calendar" title="Belum ada data harian">Grafik muncul setelah tanggal mulai terisi dan ada tugas yang selesai.</Empty>;
  const W = 640, H = 210, L = 38, R = 12, Tp = 14, B = 26;
  const x = (i: number) => L + (i / (s.length - 1)) * (W - L - R), y = (v: number) => H - B - (v / 100) * (H - B - Tp);
  const line = (f: (p: (typeof s)[number]) => number | null) => s.map((p, i) => { const v = f(p); return v === null ? "" : `${i && s[i - 1] && f(s[i - 1]!) !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; }).join("");
  const labelAt = [0, Math.floor((s.length - 1) / 2), s.length - 1];
  const hasPlan = s.some(p => p.plan !== null);
  return (
    <figure className="pj-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Progres ${m.progress} persen${m.elapsedPct !== null ? `, rencana ${m.elapsedPct} persen` : ""}`}>
        {[0, 25, 50, 75, 100].map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{t}%</text></g>)}
        {hasPlan && <path d={line(p => p.plan)} fill="none" stroke="var(--c-gray)" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={line(p => p.progress) + `L${x(s.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--d, var(--blue))" opacity=".12" />
        <path d={line(p => p.progress)} fill="none" stroke="var(--d, var(--blue))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {labelAt.map(i => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === s.length - 1 ? "end" : "middle"} fontSize="9" fill="var(--muted)">{fmtShort(s[i]!.date)}</text>)}
      </svg>
      <figcaption className="legend"><span style={{ ["--k" as string]: "var(--d, var(--blue))" }}>Progres aktual</span>{hasPlan && <span style={{ ["--k" as string]: "var(--c-gray)" }}>Rencana (sesuai jadwal)</span>}</figcaption>
    </figure>
  );
}

function People({ emails, max = 5 }: { emails: string[]; max?: number }) {
  const { member } = useViewer();
  const ms = emails.map(e => member(e)).filter(Boolean);
  if (!ms.length) return <span className="muted" style={{ fontSize: ".78rem" }}>Belum ada PIC</span>;
  return <span className="avatars" title={ms.map(m => m!.name).join(", ")}>{ms.slice(0, max).map(m => <Avatar key={m!.email} m={m!} />)}{ms.length > max && <span className="avatar sm">+{ms.length - max}</span>}</span>;
}

function ServiceCard({ x, onNew, onOpen }: { x: ServiceStat; onNew?: () => void; onOpen?: (id: string) => void }) {
  const { s } = x, num = s.targetQty > 0;
  return (
    <article className="pj-svc">
      <header><b className="clamp1">{s.name}</b><span className="pj-pct">{x.progress}%</span></header>
      <div className="pj-bar" role="progressbar" aria-valuenow={x.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${s.name}`}><i style={{ width: `${x.progress}%` }} /></div>
      <p className="pj-fig">{num ? <><b>{x.delivered.toLocaleString("id-ID")}</b> / {qtyText(s.targetQty, s.unit)}</> : <><b>{x.done}</b> / {x.tasks.length} tugas</>}{s.dueDate && <span className="muted"> · tenggat {fmtShort(s.dueDate)}</span>}</p>
      <footer>
        <People emails={x.people} />
        <span className="muted pj-sub">{x.done}/{x.tasks.length} tugas · {x.proofs} bukti{x.late ? <b className="bad"> · {x.late} terlambat</b> : null}</span>
      </footer>
      {onNew && <div className="actions"><button className="btn small" onClick={onNew}><Plus size={13} />Tugas</button></div>}
      {onOpen && x.tasks.length > 0 && (
        <ul className="pj-tasks">{x.tasks.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t => (
          <li key={t.id}><button className="linkbtn clamp1" style={{ textDecoration: "none", textAlign: "left" }} onClick={() => onOpen(t.id)}>{t.title}</button><small className="muted">{t.name} · {fmtShort(t.date)}</small>{t.qty > 0 && <span className="tag off">{t.qty}{s.unit ? " " + s.unit : ""}</span>}<span className={"stpill " + t.status}>{ST[t.status]}</span></li>))}
        </ul>
      )}
    </article>
  );
}

function Overview({ d, m }: { d: ProjectReportDTO; m: ProjectMetrics }) {
  const { member, policy } = useViewer(), { openTask } = useUi();
  const { stats: s, tasks, project: p } = d, svc = serviceStats(d, today());
  const people = useMemo(() => [...Map.groupBy(tasks, t => t.email)].map(([email, l]) => ({ email, name: l[0]!.name, total: l.length, done: l.filter(t => t.status === "done").length, qty: l.filter(t => t.status === "done").reduce((n, t) => n + t.qty, 0), proofs: l.filter(t => t.status === "done" && (t.hasPhoto || t.proofLink)).length })).sort((a, b) => b.qty - a.qty || b.done - a.done), [tasks]);
  const next = tasks.filter(t => t.status !== "done").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return (
    <div className="bento pov" data-c={p.color}>
      <section className="bc s12">
        <div className="bc-h"><span className="bc-ico lime"><FolderKanban size={18} /></span><h2>Layanan dan target</h2><span className="muted">{svc.length} layanan</span></div>
        {svc.length ? <div className="pj-svcgrid">{svc.map(x => <ServiceCard key={x.s.id} x={x} />)}</div> : <Empty art="tasks" title="Belum ada layanan">{policy.canCreateProject() ? "Buka \"Ubah proyek\" untuk menambahkan layanan, target, dan PIC." : "Layanan akan tampil di sini."}</Empty>}
      </section>

      <section className="bc s8">
        <div className="bc-h"><span className="bc-ico green"><CheckCheck size={18} /></span><h2>Perkembangan hasil</h2>{m.lines.length > 0 && <span className="muted">{linesText(m)}</span>}</div>
        <BurnUp m={m} />
      </section>
      <section className="bc s4">
        <div className="bc-h"><span className="bc-ico"><CalendarRange size={18} /></span><h2>Ketepatan waktu</h2></div>
        <div className="mid-n">{s.done ? pct(s.onTime, s.done) + "%" : "–"}</div>
        <p className="muted" style={{ fontSize: ".82rem" }}>{s.onTime} tepat waktu · {s.late} terlambat dari {s.done} selesai</p>
        <div className="legend"><span style={{ ["--k" as string]: "var(--ok)" }}>Bukti {pct(s.withProof, s.done)}%</span><span style={{ ["--k" as string]: "var(--warn)" }}>Revisi {s.revisions}×</span></div>
        <div className="bc-h" style={{ marginTop: 14 }}><span className="bc-ico lime"><Timer size={18} /></span><h2>Waktu tercatat</h2></div>
        <div className="mid-n">{s.minutes ? hm(s.minutes) : "–"}</div>
      </section>

      <section className="bc s6">
        <div className="bc-h"><span className="bc-ico"><Users size={18} /></span><h2>Kontribusi tim</h2><span className="muted">{people.length} orang</span></div>
        <table className="htable pj-people"><thead><tr><th>Nama</th><th>Tugas</th><th>Hasil</th><th>Bukti</th></tr></thead>
          <tbody>{people.map(x => { const mm = member(x.email); return (
            <tr key={x.email}><td><span className="nm">{mm && <Avatar m={mm} />}<span className="clamp1"><PersonLink email={x.email}>{x.name}</PersonLink></span></span></td><td>{x.done}/{x.total}</td><td>{x.qty ? x.qty.toLocaleString("id-ID") : "–"}</td><td>{x.proofs}</td></tr>); })}</tbody></table>
        {!people.length && <Empty art="people" title="Belum ada tugas" />}
      </section>
      <section className="bc s6">
        <div className="bc-h"><span className="bc-ico red"><ListChecks size={18} /></span><h2>Berikutnya</h2><span className="muted">{s.open} terbuka</span></div>
        <ul className="alist">{next.map(t => (
          <li key={t.id} className="arow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <div style={{ minWidth: 0 }}>{policy.isClient ? <b className="clamp1">{t.title}</b> : <button className="linkbtn clamp1" style={{ textDecoration: "none", textAlign: "left", maxWidth: "100%" }} onClick={() => openTask(t.id)}>{t.title}</button>}<small className="muted">{t.name} · {fmtShort(t.date)}</small></div>
            <span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span>
          </li>))}</ul>
        {!next.length && <Empty art="calendar" title="Tidak ada tugas terbuka" />}
      </section>

      {(p.summary || p.links.length > 0) && (
        <section className="bc s12">
          <div className="bc-h"><span className="bc-ico green"><ShieldCheck size={18} /></span><h2>Ringkasan hasil akhir</h2></div>
          {p.summary && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{p.summary}</p>}
          {p.links.length > 0 && <div className="chips">{p.links.map(l => <a key={l} className="chip" href={l} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{host(l)}</a>)}</div>}
        </section>
      )}
    </div>
  );
}

function Services({ d }: { d: ProjectReportDTO }) {
  const { policy } = useViewer(), { newTask, openTask } = useUi();
  const svc = serviceStats(d, today()), loose = d.tasks.filter(t => !t.serviceId);
  const closed = !!d.project.closedAt;
  return (
    <section className="bc">
      <div className="bc-h"><h2>Layanan per kebutuhan client</h2></div>
      {svc.length ? <div className="pj-svclist">{svc.map(x => <ServiceCard key={x.s.id} x={x} onOpen={policy.isClient ? undefined : openTask} onNew={!closed && !policy.isClient && (policy.isManager || policy.canCreateProject()) ? () => newTask({ projectId: d.project.id, serviceId: x.s.id }) : undefined} />)}</div>
        : <Empty art="tasks" title="Belum ada layanan di proyek ini">{policy.canCreateProject() ? "Gunakan tombol \"Ubah proyek\" untuk menambahkan layanan, target (mis. 100 foto), dan PIC." : "Layanan akan tampil di sini."}</Empty>}
      {loose.length > 0 && <p className="muted" style={{ marginTop: 14, fontSize: ".82rem" }}>{loose.length} tugas belum dikaitkan ke layanan.</p>}
    </section>
  );
}

function Tracking({ d, m }: { d: ProjectReportDTO; m: ProjectMetrics }) {
  const { openTask } = useUi(), { policy } = useViewer(), { member } = useViewer();
  const svcName = new Map((d.services ?? []).map(s => [s.id, s]));
  const groups = useMemo(() => dayGroups(d.tasks), [d.tasks]);
  return (
    <div className="pj-track">
      <section className="bc"><div className="bc-h"><h2>Progres harian</h2>{m.lines.length > 0 && <span className="muted">{linesText(m)}</span>}</div><BurnUp m={m} /></section>
      <section className="bc">
        <div className="bc-h"><h2>Catatan harian</h2><span className="muted">{groups.length} hari kerja</span></div>
        {groups.map(g => (
          <div key={g.date} className="pj-day">
            <header><b>{dayLong(g.date)}</b><span className="muted">{g.doneCount}/{g.tasks.length} selesai{g.qty ? ` · ${g.qty.toLocaleString("id-ID")} hasil` : ""}</span></header>
            <ul>{g.tasks.map(t => { const mm = member(t.email), sv = t.serviceId ? svcName.get(t.serviceId) : null, late = t.status !== "done" && t.date < today(); return (
              <li key={t.id}>
                <span className="who">{mm && <Avatar m={mm} />}</span>
                <div style={{ minWidth: 0 }}>
                  {policy.isClient ? <b className="clamp1">{t.title}</b> : <button className="linkbtn clamp1" style={{ textDecoration: "none", textAlign: "left", maxWidth: "100%" }} onClick={() => openTask(t.id)}>{t.title}</button>}
                  <small className="muted">{t.name}{sv ? " · " + sv.name : ""}{t.doneAt ? ` · selesai ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(t.doneAt)}` : ""}</small>
                </div>
                {t.qty > 0 && <span className="tag off">{t.qty}{sv?.unit ? " " + sv.unit : ""}</span>}
                {(t.hasPhoto || t.proofLink) && <span className="tag ok" title="Ada bukti">Bukti</span>}
                <span className={"stpill " + (late ? "late" : t.status)}>{late ? "Terlambat" : ST[t.status]}</span>
              </li>); })}</ul>
          </div>))}
        {!groups.length && <Empty art="calendar" title="Belum ada tugas harian">Tugas yang dibuat untuk proyek ini akan tercatat per hari di sini.</Empty>}
      </section>
    </div>
  );
}

function Tasks({ tasks }: { tasks: T[] }) {
  const { openTask } = useUi(), { member, policy } = useViewer();
  const [f, setF] = useState<"" | T["status"]>("");
  const rows = tasks.filter(t => !f || t.status === f);
  return (
    <section className="bc">
      <div className="bc-h"><h2>Semua tugas</h2><div className="seg" role="group" aria-label="Status"><button aria-pressed={!f} onClick={() => setF("")}>Semua {tasks.length}</button>{(["todo", "doing", "done"] as const).map(s => <button key={s} aria-pressed={f === s} onClick={() => setF(s)}>{ST[s]} {tasks.filter(t => t.status === s).length}</button>)}</div></div>
      <table className="htable" style={{ tableLayout: "fixed" }}>
        <thead><tr><th style={{ width: "38%" }}>Tugas</th><th className="hide-s">Penerima</th><th>Tanggal</th><th className="hide-s">Hasil</th><th style={{ width: 120 }}>Status</th></tr></thead>
        <tbody>{rows.map(t => { const m = member(t.email), late = t.status !== "done" && t.date < today(); return (
          <tr key={t.id} className={policy.isClient ? "" : "hr"} onClick={policy.isClient ? undefined : () => openTask(t.id)}>
            <td><span className="nm"><b>{t.title}</b>{t.revisions > 0 && <span className="tag off">Revisi {t.revisions}×</span>}</span></td>
            <td className="hide-s"><span className="nm">{m && <Avatar m={m} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span></span></td>
            <td>{fmtShort(t.date)}</td><td className="hide-s">{t.qty || "–"}</td>
            <td><span className={"stpill " + (late ? "late" : t.status)}>{late ? "Terlambat" : ST[t.status]}</span></td>
          </tr>); })}</tbody>
      </table>
      {!rows.length && <Empty art="search" title="Tidak ada tugas" />}
    </section>
  );
}

function Proofs({ d, eager }: { d: ProjectReportDTO; eager?: boolean }) {
  const { openTask } = useUi(), { policy } = useViewer();
  const [zoom, setZoom] = useState<string | null>(null), [svc, setSvc] = useState("");
  const names = new Map((d.services ?? []).map(s => [s.id, s]));
  const done = d.tasks.filter(t => t.status === "done" && (!svc || t.serviceId === svc));
  const total = done.reduce((n, t) => n + t.qty, 0), withProof = done.filter(t => t.hasPhoto || t.proofLink).length;
  return (
    <section className="bc">
      <div className="bc-h"><span className="bc-ico"><ImageIcon size={18} /></span><h2>Bukti dan hasil</h2><span className="muted">{done.length} tugas · {withProof} dengan bukti{total ? ` · ${total.toLocaleString("id-ID")} hasil` : ""}</span>
        {(d.services?.length ?? 0) > 1 && <div className="seg" role="group" aria-label="Layanan"><button aria-pressed={!svc} onClick={() => setSvc("")}>Semua</button>{d.services!.map(s => <button key={s.id} aria-pressed={svc === s.id} onClick={() => setSvc(s.id)}>{s.name}</button>)}</div>}</div>
      <div className="proofgrid">{done.map(t => { const sv = t.serviceId ? names.get(t.serviceId) : null; return (
        <article key={t.id} className="proofcard">
          {t.hasPhoto ? <button className="thumbbig" onClick={() => setZoom(t.id)} aria-label={`Perbesar bukti ${t.title}`}><img src={`/api/tasks/${t.id}/proof`} alt="" loading={eager ? "eager" : "lazy"} /></button> : <div className="thumbbig empty">Tanpa foto</div>}
          <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
            {policy.isClient ? <b className="clamp2" style={{ fontSize: ".9rem" }}>{t.title}</b> : <button className="linkbtn clamp2" style={{ textAlign: "left", textDecoration: "none", fontSize: ".9rem" }} onClick={() => openTask(t.id)}>{t.title}</button>}
            <small className="muted">{t.name} · {fmtShort(t.date)}{sv ? " · " + sv.name : ""}{t.minutes ? " · " + hm(t.minutes) : ""}{t.revisions ? ` · revisi ${t.revisions}×` : ""}</small>
            {t.qty > 0 && <span className="tag off" style={{ width: "fit-content" }}>{t.qty}{sv?.unit ? " " + sv.unit : ""} dikirim</span>}
            {t.proofLink && <a className="chip" style={{ width: "fit-content" }} href={t.proofLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{host(t.proofLink)}</a>}
            {t.report && <p className="clamp3" style={{ fontSize: ".8rem", color: "var(--muted)" }}>{t.report}</p>}
          </div>
        </article>); })}</div>
      {!done.length && <Empty art="tasks" title="Belum ada tugas selesai">Bukti muncul di sini saat tugas diselesaikan.</Empty>}
      {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(null)}><img src={`/api/tasks/${zoom}/proof`} alt="Foto bukti" /></div>}
    </section>
  );
}

function Activity({ ids }: { ids: Set<string> }) {
  const { member, me } = useViewer(), { openTask } = useUi();
  const items = (useFeed(true, 100).data ?? []).filter(a => a.taskId && ids.has(a.taskId));
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`; };
  return (
    <section className="bc"><div className="bc-h"><span className="bc-ico"><History size={18} /></span><h2>Aktivitas proyek</h2></div>
      <div className="tline"><div>{items.map(a => { const m = member(a.actorEmail); return (
        <div key={a.id} className="it">{m ? <Avatar m={m} /> : <span className="avatar">{a.actorName[0]}</span>}
          <div style={{ minWidth: 0 }}><div><b>{a.actorEmail === me.email ? "Kamu" : a.actorName}</b> {a.text}</div>{a.taskTitle && <button className="linkbtn clamp1" style={{ maxWidth: "100%", textAlign: "left" }} onClick={() => a.taskId && openTask(a.taskId)}>{a.taskTitle}</button>}</div>
          <small>{ago(a.at)}</small></div>); })}</div></div>
      {!items.length && <Empty art="activity" title="Belum ada aktivitas" />}
    </section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "ok" }) {
  return <div className={"pj-kpi" + (tone ? " " + tone : "")}><small>{label}</small><b>{value}</b>{sub && <em>{sub}</em>}</div>;
}

/** Project detail: who is involved, how far it is, and what was handed in. Closed projects read as the final report. */
export function ProjectReportPage() {
  const [, params] = useRoute("/proyek/:id");
  const id = params?.id ?? "";
  const q = useProjectReport(id), d = q.data;
  const { member, policy } = useViewer(), { newTask } = useUi();
  const owner = useMeta(true).data?.owner;
  const [, go] = useLocation();
  const [tab, setTab] = useState("ringkas"), [closing, setClosing] = useState(false), [editing, setEditing] = useState(false), [printing, setPrinting] = useState(false);
  // "Cetak" prints the whole report (summary, services, daily log, proofs), not just the open tab.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 600);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); };
  }, [printing]);
  const reopen = useAction(() => ok(api.meta.projects[":id"].reopen.$post({ param: { id } })), { done: "Proyek dibuka kembali", refresh: [keys.meta, keys.analytics] });
  const m = useMemo(() => (d ? projectMetrics(d, today()) : null), [d]);
  if (!d || !m) return <Page title="Detail proyek"><p className="muted">{q.isError ? "Proyek tidak ditemukan." : "Memuat…"}</p></Page>;
  const { project: p, stats: s, tasks } = d;
  const closer = p.closedBy ? member(p.closedBy)?.name ?? (p.closedBy === owner?.email ? owner.name : p.closedBy) : null;
  const client = p.clientEmail ? member(p.clientEmail) : null, pm = p.pmEmail ? member(p.pmEmail) : null;
  const canEdit = !policy.isClient && (policy.isManager || policy.canCreateProject());
  return (
    <Page noNew back="/proyek" title={p.name} sub={<Link href="/proyek" className="plink back-desktop" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ArrowLeft size={14} />Semua proyek</Link>}
      tabs={[
        { id: "ringkas", label: "Ringkasan" },
        { id: "layanan", label: `Layanan (${d.services?.length ?? 0})` },
        { id: "harian", label: "Tracking harian" },
        { id: "bukti", label: "Bukti & hasil" },
        { id: "tugas", label: `Semua tugas (${s.total})` },
        { id: "aktivitas", label: "Aktivitas" },
      ].filter(t => !(policy.isClient && t.id === "aktivitas"))}
      tab={tab} onTab={setTab}
      actions={<button className="btn small" disabled={printing} onClick={() => setPrinting(true)}><Printer size={14} />Cetak laporan</button>}>
      <p className="print-only pj-printmeta">Laporan proyek · dicetak {day(Date.now())}{client ? ` · Client: ${client.name}` : ""}{pm ? ` · PM: ${pm.name}` : ""}</p>
      <section className="projhead pj-head" data-c={p.color}>
        <Ring value={m.progress} />
        <div className="ph-main">
          <div className="chips"><span className={"pj-health " + m.health} title={m.healthNote}>{HEALTH_LABEL[m.health]}</span>
            {(m.start || m.due) && <span className="chip"><CalendarRange size={13} />{m.start ? fmtShort(m.start) : "…"} – {m.due ? fmtShort(m.due) : "…"}</span>}
            {m.daysLeft !== null && !p.closedAt && <span className={"chip" + (m.daysLeft < 0 ? " bad" : "")}>{m.daysLeft < 0 ? `Lewat ${-m.daysLeft} hari` : m.daysLeft === 0 ? "Tenggat hari ini" : `${m.daysLeft} hari lagi`}</span>}</div>
          <p className="muted" style={{ maxWidth: "62ch" }}>{p.description || m.healthNote}</p>
          <div className="pj-who">
            <span><small>Client</small>{client ? <b><Avatar m={client} />{client.name}</b> : <b className="muted">Belum ada akun client</b>}</span>
            <span><small>Penanggung jawab</small>{pm ? <b><Avatar m={pm} />{pm.name}</b> : <b className="muted">Belum ditentukan</b>}</span>
            <span><small>Tim</small><People emails={[...new Set([...(d.services ?? []).flatMap(x => x.picEmails), ...tasks.map(t => t.email)])]} max={6} /></span>
          </div>
          {p.closedAt && <small className="muted">Ditutup {day(p.closedAt)}{closer ? " oleh " + closer : ""}</small>}
        </div>
        <div className="ph-side">
          <div className="chips">
            {canEdit && !p.closedAt && <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} />Ubah proyek</button>}
            {!p.closedAt && !policy.isClient && <button className="btn blue" onClick={() => newTask({ projectId: p.id })}><Plus size={15} />Tambah tugas</button>}
            {policy.isManager && (p.closedAt ? <button className="btn" disabled={reopen.isPending} onClick={() => reopen.mutate()}><RotateCcw size={14} />Buka kembali</button> : <button className="btn primary" onClick={() => setClosing(true)}>Tutup proyek</button>)}
          </div>
        </div>
      </section>
      <div className="pj-kpis">
        <Kpi label="Hasil terkumpul" value={m.lines.length === 1 ? `${m.lines[0]!.delivered.toLocaleString("id-ID")} / ${m.lines[0]!.target.toLocaleString("id-ID")}` : m.lines.length ? `${m.progress}%` : String(tasks.filter(t => t.status === "done").reduce((n, t) => n + t.qty, 0))} sub={m.lines.length === 1 ? m.lines[0]!.unit : m.lines.length ? linesText(m) : "belum ada target"} />
        <Kpi label="Tugas selesai" value={`${s.done}/${s.total}`} sub={`${s.open} terbuka`} />
        <Kpi label="Bukti terlampir" value={String(s.withProof)} sub={s.done ? `${pct(s.withProof, s.done)}% dari selesai` : "–"} />
        <Kpi label="Terlambat" value={String(tasks.filter(t => t.status !== "done" && t.date < today()).length)} sub="tugas belum selesai" tone={tasks.some(t => t.status !== "done" && t.date < today()) ? "bad" : undefined} />
        <Kpi label="Revisi" value={`${s.revisions}×`} sub={s.minutes ? hm(s.minutes) + " tercatat" : undefined} />
      </div>
      {(tab === "ringkas" || printing) && <Overview d={d} m={m} />}
      {(tab === "layanan" || printing) && <Services d={d} />}
      {(tab === "harian" || printing) && <Tracking d={d} m={m} />}
      {(tab === "bukti" || printing) && <Proofs d={d} eager={printing} />}
      {tab === "tugas" && !printing && <Tasks tasks={tasks} />}
      {tab === "aktivitas" && <Activity ids={new Set(tasks.map(t => t.id))} />}
      {closing && <CloseProject p={p} openTasks={s.open} onClose={() => { setClosing(false); go("/proyek/" + p.id); }} />}
      {editing && <ProjectSetup project={p} onClose={() => setEditing(false)} />}
    </Page>
  );
}

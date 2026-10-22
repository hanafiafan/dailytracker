import { useMemo, useState } from "react";
import type { TaskDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { weekStart } from "../lib/tasks";
import { CloseProject } from "../components/CloseProject";
import { ProjectSetup } from "../components/ProjectSetup";
import { ProjectsLabels } from "../components/ProjectsLabels";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { today } from "../lib/format";
import { useLocation } from "wouter";
import { useIsMobile } from "../lib/useMedia";
import { api, ok } from "../lib/api";
import { keys, useAction, useMeta, useTasks, windowFrom } from "../lib/queries";
import { HEALTH_LABEL, pct as pctOf, type Health } from "../lib/projects";
import { useUi, useViewer } from "../lib/viewer";

function Ring({ pct }: { pct: number }) {
  return (
    <div className="pring"><svg viewBox="0 0 40 40" width="56" height="56" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--glass)" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--d, var(--blue))" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 20 20)" />
    </svg><b>{pct}%</b></div>
  );
}

const DAYS = 28;
/** Each project as a bar from its first to its last task day (inside a four-week window); the dark part is the share done. */
function Gantt({ tasks }: { tasks: TaskDTO[] }) {
  const [, go] = useLocation();
  const { projects } = useViewer();
  const { date } = useUi();
  const start = addDays(weekStart(date), -7), end = addDays(start, DAYS - 1);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const pos = (d: string) => Math.max(0, Math.min(DAYS - 1, days.indexOf(d) >= 0 ? days.indexOf(d) : d < start ? 0 : DAYS - 1));
  const rows = projects.filter(p => !p.archived).map(p => {
    const l = tasks.filter(t => t.projectId === p.id && t.date <= end && t.date >= start);
    if (!l.length) return null;
    const a = l.reduce((m, t) => (t.date < m ? t.date : m), l[0]!.date), b = l.reduce((m, t) => (t.date > m ? t.date : m), l[0]!.date);
    const done = l.filter(t => t.status === "done").length;
    return { p, a: pos(a), b: pos(b), pct: Math.round(done / l.length * 100), l };
  }).filter(Boolean) as { p: (typeof projects)[number]; a: number; b: number; pct: number; l: TaskDTO[] }[];
  const todayIdx = days.indexOf(today());
  if (!rows.length) return <div className="bc"><Empty art="calendar" title="Belum ada jadwal proyek">Tugas yang punya proyek akan tampil di sini.</Empty></div>;
  return (
    <section className="bc"><div className="bc-h"><h2>Garis waktu 4 minggu</h2><span className="legend"><span style={{ ["--k" as string]: "var(--blue)" }}>Bagian gelap = selesai</span></span></div>
      <div className="heatwrap"><div className="gantt" style={{ ["--n" as string]: DAYS }}>
        <div />{days.map((d, i) => <div key={d} className={"gd" + (d === today() ? " today" : "") + (i % 7 === 0 ? " wk" : "")}>{i % 7 === 0 || d === today() ? <b>{Number(d.slice(8))}</b> : Number(d.slice(8))}</div>)}
        {rows.map(({ p, a, b, pct, l }) => [
          <div key={p.id} className="gp" data-c={p.color}><a className="plink clamp1" href={"/proyek/" + p.id} onClick={e => { e.preventDefault(); go("/proyek/" + p.id); }}>{p.name}</a><small className="muted">{l.length} tugas</small></div>,
          <div key={p.id + "t"} className="gtrack" style={{ gridColumn: "2 / -1" }}>
            {todayIdx >= 0 && <i className="gtoday" style={{ left: `${(todayIdx + .5) / DAYS * 100}%` }} />}
            <div className="gbar" data-c={p.color} style={{ left: `${a / DAYS * 100}%`, width: `${(b - a + 1) / DAYS * 100}%` }} title={`${p.name}: ${pct}% selesai`}><i style={{ width: `${pct}%` }} /><span>{pct}%</span></div>
          </div>,
        ])}
      </div></div>
    </section>
  );
}

import { ArrowUpRight, FolderPlus, Plus, Search, Archive } from "lucide-react";

export function ProjectsPage() {
  const { me, projects, policy, member } = useViewer();
  const { date } = useUi();
  const [tab, setTab] = useState("ringkas"), [closing, setClosing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [showAddProject, setShowAddProject] = useState(false);
  const [, go] = useLocation();
  const mobile = useIsMobile();
  const reopen = useAction((id: string) => ok(api.meta.projects[":id"].reopen.$post({ param: { id } })), { done: "Proyek dibuka kembali", refresh: [keys.meta] });
  const stats = useMeta(true).data?.projectStats ?? {};

  const tq = useTasks(windowFrom(date, today()), true);

  const rows = useMemo(() => {
    const all = tq.data ?? [];
    return projects
      .filter(p => {
        // A client only sees the projects that carry their account.
        if (policy.isClient && p.clientEmail !== me.email) return false;
        // Status filter
        if (statusFilter === "active" && (p.closedAt || p.archived)) return false;
        if (statusFilter === "archived" && !p.closedAt && !p.archived) return false;
        // Search query
        if (q.trim()) {
          const term = q.trim().toLowerCase();
          const matchName = p.name.toLowerCase().includes(term);
          const matchDesc = p.description?.toLowerCase().includes(term) ?? false;
          if (!matchName && !matchDesc) return false;
        }
        return true;
      })
      .map(p => {
        const l = all.filter(t => t.projectId === p.id), st = stats[p.id];
        const total = st?.total ?? l.length, done = st?.done ?? l.filter(t => t.status === "done").length;
        const late = l.filter(t => t.status !== "done" && t.date < today()).length;
        const who = [...new Set(l.map(t => t.email))].map(e => member(e)).filter(Boolean);
        const sv = st?.services ?? [], withT = sv.filter(x => x.target > 0);
        const pct = withT.length ? Math.round(withT.reduce((n, x) => n + pctOf(x.delivered, x.target), 0) / withT.length) : pctOf(done, total);
        const units = [...new Set(withT.map(x => x.unit))], one = units.length === 1 ? withT.reduce((a, x) => ({ d: a.d + x.delivered, t: a.t + x.target }), { d: 0, t: 0 }) : null;
        const result = one ? `${one.d.toLocaleString("id-ID")}/${one.t.toLocaleString("id-ID")} ${units[0]}`.trim() : withT.length ? `${withT.length} target` : null;
        const left = p.dueDate ? Math.round((new Date(p.dueDate + "T12:00:00+07:00").getTime() - new Date(today() + "T12:00:00+07:00").getTime()) / 86_400_000) : null;
        const elapsed = p.startDate && p.dueDate ? pctOf(Math.max(0, Math.round((new Date(today()).getTime() - new Date(p.startDate).getTime()) / 86_400_000) + 1), Math.round((new Date(p.dueDate).getTime() - new Date(p.startDate).getTime()) / 86_400_000) + 1) : null;
        const health: Health = p.closedAt || pct >= 100 ? "done" : left !== null && left < 0 ? "late" : elapsed !== null && pct + 15 < elapsed ? "risk" : total || withT.length ? "ok" : "idle";
        return { p, total, done, late, open: total - done, pct, who, result, left, health, services: sv.length };
      })
      .sort((a, b) => b.open - a.open);
  }, [tq.data, projects, member, statusFilter, q, policy.isClient, me.email, stats]);

  return (
    <Page title="Proyek" sub="Kemajuan tiap proyek dari tugas 30 hari terakhir dan seterusnya"
      tabs={[
        { id: "ringkas", label: "Ringkasan" },
        { id: "waktu", label: "Garis waktu" },
        ...(policy.canCreateProject() ? [{ id: "kelola", label: "Kelola proyek & label" }] : [])
      ]}
      tab={tab} onTab={setTab}>

      {tab === "kelola" && policy.canCreateProject() ? (
        <ProjectsLabels />
      ) : tab === "waktu" ? (
        <Gantt tasks={tq.data ?? []} />
      ) : (
        <>
          {/* Controls: Search, Filter Tabs, Add Button */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px", maxWidth: 360, position: "relative" }}>
              <Search size={16} className="muted" style={{ position: "absolute", left: 10 }} />
              <input
                className="input"
                style={{ paddingLeft: 32, width: "100%" }}
                placeholder="Cari nama atau deskripsi proyek..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="seg" role="group" aria-label="Filter status">
                <button aria-pressed={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
                  Aktif ({projects.filter(p => !p.closedAt && !p.archived).length})
                </button>
                <button aria-pressed={statusFilter === "archived"} onClick={() => setStatusFilter("archived")}>
                  Arsip ({projects.filter(p => p.closedAt || p.archived).length})
                </button>
                <button aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                  Semua ({projects.length})
                </button>
              </div>

              {policy.canCreateProject() && (
                <button className="btn primary small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => setShowAddProject(!showAddProject)}>
                  <Plus size={15} />
                  <span>Tambah Proyek</span>
                </button>
              )}
            </div>
          </div>

          {showAddProject && policy.canCreateProject() && <ProjectSetup onClose={() => setShowAddProject(false)} />}

          {rows.length && mobile ? (
            <div className="mpgrid">{rows.map(({ p, total, late, open, pct }, i) => (
              <button key={p.id} className={"mproj " + (p.closedAt ? "" : i % 3 === 0 ? "lime" : i % 3 === 1 ? "dark" : "")} data-c={p.color} onClick={() => go("/proyek/" + p.id)}>
                <span className="mt-go"><ArrowUpRight size={16} /></span><small className="clamp2">{p.name}{p.closedAt ? " · selesai" : ""}</small><b>{pct}<span>%</span></b>
                <em>{open} terbuka · {total} tugas{late ? ` · ${late} terlambat` : ""}</em><span className="mprog"><i style={{ width: `${pct}%` }} /></span>
              </button>))}</div>
          ) : rows.length ? (
            <div className="pcards">
              {rows.map(({ p, total, done, late, open, pct, who, result, left, health, services }) => {
                const client = p.clientEmail ? member(p.clientEmail) : null, pm = p.pmEmail ? member(p.pmEmail) : null;
                return (
                <article key={p.id} className={"pcard link" + (p.closedAt ? " closed" : "")} data-c={p.color} onClick={() => go("/proyek/" + p.id)}>
                  <div className="ph"><Ring pct={pct} /><div style={{ minWidth: 0 }}><h2 className="clamp1"><a href={"/proyek/" + p.id} className="plink" onClick={e => { e.preventDefault(); e.stopPropagation(); go("/proyek/" + p.id); }}>{p.name}</a></h2><p className="clamp2">{p.description || "Tanpa deskripsi"}</p>
                    <div className="chips" style={{ marginTop: 6 }}><span className={"pj-health " + health}>{HEALTH_LABEL[health]}</span>{left !== null && !p.closedAt && <span className={"chip" + (left < 0 ? " bad" : "")}>{left < 0 ? `Lewat ${-left} hari` : left === 0 ? "Tenggat hari ini" : `${left} hari lagi`}</span>}</div></div></div>
                  {(client || pm || services > 0) && <div className="pj-meta">
                    <span><small>Client</small><b className="clamp1">{client?.name ?? "–"}</b></span>
                    <span><small>PM</small><b className="clamp1">{pm?.name ?? "–"}</b></span>
                    <span><small>{result ? "Hasil" : "Layanan"}</small><b className="clamp1">{result ?? (services || "–")}</b></span>
                  </div>}
                  <div className="nums"><div><b>{open}</b><small>Terbuka</small></div><div><b>{done}</b><small>Selesai</small></div><div><b style={{ color: late ? "var(--bad)" : undefined }}>{late}</b><small>Terlambat</small></div></div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="avatars">{who.slice(0, 5).map(m => <Avatar key={m!.email} m={m!} />)}</span>
                    <span className="muted" style={{ fontSize: ".78rem", fontWeight: 600 }}>{total} tugas</span>
                  </div>
                  <div className="chips">
                    <button className="btn small" onClick={e => { e.stopPropagation(); go("/proyek/" + p.id); }}>{p.closedAt ? "Laporan akhir" : "Detail"}</button>
                    {(policy.isManager || policy.canCreateProject()) && !policy.isClient && (p.closedAt ? <button className="btn small ghost" onClick={e => { e.stopPropagation(); reopen.mutate(p.id); }}>Buka kembali</button> : <button className="btn small primary" onClick={e => { e.stopPropagation(); setClosing(p.id); }}>Tutup proyek</button>)}
                  </div>
                </article>); })}
            </div>
          ) : (
            <div className="bc">
              <Empty art="tasks" title={statusFilter === "archived" ? "Tidak ada arsip proyek" : q ? "Proyek tidak ditemukan" : "Belum ada proyek"}>
                {statusFilter === "archived" ? "Proyek yang sudah selesai atau ditutup akan tersimpan rapi di sini." : q ? `Tidak ada proyek yang cocok dengan "${q}".` : policy.canCreateProject() ? "Mulai dengan membuat proyek baru untuk mengatur tugas tim." : "Proyek akan muncul di sini."}
              </Empty>
            </div>
          )}
        </>
      )}

      {closing && <CloseProject p={projects.find(x => x.id === closing)!} openTasks={rows.find(r => r.p.id === closing)?.open ?? 0} onClose={() => setClosing(null)} />}
    </Page>
  );
}

import { useMemo, useState } from "react";
import { ProjectsLabels } from "../components/ProjectsLabels";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { today } from "../lib/format";
import { useTasks, windowFrom } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";

function Ring({ pct }: { pct: number }) {
  return (
    <div className="pring"><svg viewBox="0 0 40 40" width="56" height="56" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--glass)" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--d, var(--blue))" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 20 20)" />
    </svg><b>{pct}%</b></div>
  );
}

export function ProjectsPage() {
  const { projects, policy, member } = useViewer();
  const { date } = useUi();
  const [tab, setTab] = useState("ringkas");
  const tq = useTasks(windowFrom(date, today()), true);
  const rows = useMemo(() => {
    const all = tq.data ?? [];
    return projects.filter(p => !p.archived).map(p => {
      const l = all.filter(t => t.projectId === p.id), done = l.filter(t => t.status === "done").length;
      const late = l.filter(t => t.status !== "done" && t.date < today()).length;
      const who = [...new Set(l.map(t => t.email))].map(e => member(e)).filter(Boolean);
      return { p, total: l.length, done, late, open: l.length - done, pct: l.length ? Math.round(done / l.length * 100) : 0, who };
    }).sort((a, b) => b.open - a.open);
  }, [tq.data, projects, member]);
  return (
    <Page title="Proyek" sub="Kemajuan tiap proyek dari tugas 30 hari terakhir dan seterusnya"
      tabs={policy.isManager ? [{ id: "ringkas", label: "Ringkasan" }, { id: "kelola", label: "Kelola proyek & label" }] : undefined} tab={tab} onTab={setTab}>
      {tab === "kelola" && policy.isManager ? <ProjectsLabels /> : rows.length ? (
        <div className="pcards">
          {rows.map(({ p, total, done, late, open, pct, who }) => (
            <article key={p.id} className="pcard" data-c={p.color}>
              <div className="ph"><Ring pct={pct} /><div style={{ minWidth: 0 }}><h3 className="clamp1">{p.name}</h3><p className="clamp2">{p.description || "Tanpa deskripsi"}</p></div></div>
              <div className="nums"><div><b>{open}</b><small>Terbuka</small></div><div><b>{done}</b><small>Selesai</small></div><div><b style={{ color: late ? "var(--bad)" : undefined }}>{late}</b><small>Terlambat</small></div></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="avatars">{who.slice(0, 5).map(m => <Avatar key={m!.email} m={m!} />)}</span>
                <span className="muted" style={{ fontSize: ".78rem", fontWeight: 600 }}>{total} tugas</span>
              </div>
            </article>))}
        </div>
      ) : <div className="bc"><Empty art="tasks" title="Belum ada proyek">{policy.isManager ? "Buat proyek di tab Kelola untuk mengelompokkan tugas." : "Proyek akan muncul di sini."}</Empty></div>}
    </Page>
  );
}

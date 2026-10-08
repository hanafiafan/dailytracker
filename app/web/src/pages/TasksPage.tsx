import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, STATUSES, type Priority, type Status, type TaskDTO } from "@shared/schemas";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { api, ok } from "../lib/api";
import { STATUS, fmtShort, today } from "../lib/format";
import { keys, useTasks, windowFrom } from "../lib/queries";
import { PRIORITY_LABEL, PRIORITY_RANK, subtaskProgress } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

type Key = "title" | "who" | "project" | "priority" | "date" | "status";

export function TasksPage() {
  const { team, policy, projects, member, project } = useViewer();
  const { date, openTask } = useUi();
  const qc = useQueryClient();
  const tq = useTasks(windowFrom(date, today()), true);
  const [q, setQ] = useState(""), [st, setSt] = useState<Status | "open">("open"), [who, setWho] = useState("");
  const [sort, setSort] = useState<{ k: Key; asc: boolean }>({ k: "date", asc: true });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const people = team.filter(m => !m.isAdmin && policy.canSee(m.email));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase(), d = sort.asc ? 1 : -1;
    const val = (t: TaskDTO) => ({
      title: t.title.toLowerCase(), who: member(t.email)?.name ?? "", project: project(t.projectId)?.name ?? "~",
      priority: String(PRIORITY_RANK[t.priority]), date: t.date + (t.start ?? t.due ?? ""), status: String(STATUSES.indexOf(t.status)),
    })[sort.k];
    return (tq.data ?? [])
      .filter(t => (st === "open" ? t.status !== "done" : t.status === st) && (!who || t.email === who) && (!s || t.title.toLowerCase().includes(s)))
      .sort((a, b) => d * val(a).localeCompare(val(b)));
  }, [tq.data, q, st, who, sort, member, project]);

  const ids = rows.map(t => t.id), picked = ids.filter(i => sel.has(i)), all = !!ids.length && picked.length === ids.length;
  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortBy = (k: Key) => setSort(p => ({ k, asc: p.k === k ? !p.asc : true }));
  const Th = ({ k, children, cls }: { k: Key; children: string; cls?: string }) => (
    <th className={cls} aria-sort={sort.k === k ? (sort.asc ? "ascending" : "descending") : "none"}>
      <button className="thbtn" onClick={() => sortBy(k)}>{children}{sort.k === k && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button>
    </th>
  );

  // One request per task (no bulk endpoint): the server checks permission per task, so failures are counted, not hidden.
  async function bulk(label: string, fn: (id: string) => Promise<unknown>, clear = true) {
    setBusy(true);
    const res = await Promise.allSettled(picked.map(fn));
    const fail = res.filter(r => r.status === "rejected").length;
    setBusy(false);
    await Promise.all([keys.tasks, keys.activity, keys.analytics, keys.team].map(k => qc.invalidateQueries({ queryKey: k })));
    toast(fail ? `${label}: ${picked.length - fail} berhasil, ${fail} ditolak` : `${label}: ${picked.length} tugas`);
    if (clear) setSel(new Set());
  }
  const canAll = picked.every(i => { const t = rows.find(r => r.id === i); return t && policy.canManage(t.email); });

  return (
    <Page title="Daftar tugas" sub="Semua tugas dalam satu tabel. Pilih beberapa baris untuk mengubah sekaligus.">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Status">
          {([["open", "Belum selesai"], ...STATUSES.map(s => [s, STATUS[s]])] as [string, string][]).map(([k, l]) => <button key={k} aria-pressed={st === k} onClick={() => setSt(k as Status | "open")}>{l}</button>)}
        </div>
        <input className="input" style={{ width: 200 }} placeholder="Cari judul…" value={q} onChange={e => setQ(e.target.value)} aria-label="Cari judul" />
        {policy.isManager && <select className="input" value={who} onChange={e => setWho(e.target.value)} aria-label="Orang"><option value="">Semua orang</option>{people.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>}
        <span className="muted" style={{ marginLeft: "auto", fontSize: ".8rem" }}>{rows.length} tugas</span>
      </div>
      {picked.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Aksi massal">
          <b>{picked.length} dipilih</b>
          <select className="input" disabled={busy} value="" onChange={e => { const s = e.target.value as Status; if (s) void bulk(`Status ${STATUS[s]}`, id => ok(api.tasks[":id"].status.$patch({ param: { id }, json: { status: s } }))); }} aria-label="Ubah status">
            <option value="">Ubah status…</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
          </select>
          <select className="input" disabled={busy || !canAll} value="" onChange={e => { const p = e.target.value as Priority; if (p) void bulk(`Prioritas ${PRIORITY_LABEL[p]}`, id => ok(api.tasks[":id"].$patch({ param: { id }, json: { priority: p } }))); }} aria-label="Ubah prioritas">
            <option value="">Prioritas…</option>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
          {policy.isManager && <select className="input" disabled={busy || !canAll} value="" onChange={e => { const email = e.target.value; if (email) void bulk("Dipindahkan", id => ok(api.tasks[":id"].$patch({ param: { id }, json: { email } }))); }} aria-label="Pindahkan ke">
            <option value="">Pindahkan ke…</option>{people.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
          </select>}
          <select className="input" disabled={busy || !canAll} value="" onChange={e => { const v = e.target.value; if (v) void bulk("Proyek diubah", id => ok(api.tasks[":id"].$patch({ param: { id }, json: { projectId: v === "none" ? null : v } }))); }} aria-label="Ubah proyek">
            <option value="">Proyek…</option><option value="none">Tanpa proyek</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn ghost danger" disabled={busy || !canAll} onClick={() => { if (confirm(`Hapus ${picked.length} tugas? Tindakan ini tidak bisa dibatalkan.`)) void bulk("Dihapus", id => ok(api.tasks[":id"].$delete({ param: { id } }))); }}>Hapus</button>
          <button className="btn ghost" onClick={() => setSel(new Set())}>Batal</button>
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table className="ptable ttable">
          <thead><tr>
            <th className="chk"><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(ids))} aria-label="Pilih semua" /></th>
            <Th k="title">Tugas</Th><Th k="who" cls="w-who">Penerima</Th><Th k="project" cls="w-proj">Proyek</Th>
            <Th k="priority" cls="w-prio">Prioritas</Th><Th k="date" cls="w-date">Jadwal</Th><Th k="status" cls="w-st">Status</Th>
          </tr></thead>
          <tbody>
            {rows.map(t => {
              const m = member(t.email), p = project(t.projectId), sp = subtaskProgress(t), late = t.status !== "done" && t.date < today();
              return (
                <tr key={t.id} className={"ptr" + (sel.has(t.id) ? " open" : "")} onClick={() => openTask(t.id)}>
                  <td className="chk" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Pilih ${t.title}`} /></td>
                  <td><b className="clamp1" title={t.title}>{t.title}</b>{sp.total > 0 && <small className="muted"> {sp.done}/{sp.total}</small>}</td>
                  <td><span className="who">{m && <Avatar m={m} />}<span className="clamp1">{m?.name ?? t.email}</span></span></td>
                  <td>{p ? <span className="pbadge" data-c={p.color}>{p.name}</span> : <span className="muted">—</span>}</td>
                  <td><span className={"tag " + t.priority}>{PRIORITY_LABEL[t.priority]}</span></td>
                  <td className={late ? "bad" : ""}>{fmtShort(t.date)}{t.start ? ` · ${t.start}` : ""}</td>
                  <td>{STATUS[t.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty title="Tidak ada tugas">Ubah filter untuk melihat tugas lain.</Empty>}
      </div>
    </Page>
  );
}

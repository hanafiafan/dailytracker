import { useState } from "react";
import { Download } from "lucide-react";
import type { Priority } from "@shared/schemas";
import { addDays } from "@shared/time";
import { Page } from "../components/Page";
import { DayBars, Donut, HBar } from "../components/Charts";
import { today } from "../lib/format";
import { useAnalytics } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useViewer } from "../lib/viewer";

const PRIO_COLOR: Record<Priority, string> = { urgent: "#5F31C4", high: "#C6F04A", normal: "#2547E8", low: "#AEB6C1" };
const dur = (min: number | null) => min === null ? "–" : min < 60 ? `${min} mnt` : `${Math.floor(min / 60)} j ${min % 60} m`;

export function ReportsPage() {
  const { policy, projects, labels } = useViewer();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState("ringkas");
  const to = today(), from = addDays(to, -(days - 1));
  const q = useAnalytics(from, to, true), d = q.data;
  const pct = (v: number | null) => v === null ? "–" : Math.round(v * 100) + "%";
  const maxP = Math.max(1, ...(d?.perPerson ?? []).map(p => p.total));
  const maxProj = Math.max(1, ...(d?.byProject ?? []).map(p => p.total));
  return (
    <Page title="Laporan" sub={`${from} s/d ${to}${policy.isManager ? "" : " · hanya tugasmu"}`}
      tabs={[{ id: "ringkas", label: "Ringkasan" }, ...(policy.isManager ? [{ id: "orang", label: "Per orang" }] : []), { id: "proyek", label: "Proyek & label" }]} tab={tab} onTab={setTab}
      actions={<>
        <div className="seg" role="group" aria-label="Rentang">{[7, 30, 90].map(n => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n} hari</button>)}</div>
        {policy.isManager && <a className="btn small primary" href={`/api/reports/tasks.csv?from=${from}&to=${to}`} download><Download size={14} />Ekspor CSV</a>}
      </>}>
      {!d ? <p className="muted">Memuat…</p> : <>
        <div className="surface"><div className="statrow">
          <div className="stat" data-c="sky"><span className="v">{d.totals.total}</span><span className="k">Total tugas</span></div>
          <div className="stat" data-c="mint"><span className="v">{d.totals.done}</span><span className="k">Selesai ({pct(d.totals.total ? d.totals.done / d.totals.total : null)})</span></div>
          <div className="stat" data-c="lilac"><span className="v">{pct(d.totals.onTimeRate)}</span><span className="k">Tepat waktu</span></div>
          <div className="stat" data-c="peach"><span className="v">{d.totals.overdue}</span><span className="k">Terlambat (belum selesai)</span></div>
          <div className="stat" data-c="pink"><span className="v">{dur(d.totals.avgCompletionMin)}</span><span className="k">Rata-rata pengerjaan</span></div>
        </div></div>

        {tab === "ringkas" && (
          <div className="two" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
            <section className="surface"><div className="surface-h"><h2>Tugas per hari</h2><div className="legend"><span><i style={{ background: "#93C21A" }} />selesai</span><span><i style={{ background: "#2547E8", opacity: .55 }} />belum</span></div></div><DayBars data={d.daily} /></section>
            <section className="surface"><div className="surface-h"><h2>Prioritas</h2></div>
              <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
                <Donut center={String(d.totals.total)} slices={(Object.keys(d.byPriority) as Priority[]).map(p => ({ label: PRIORITY_LABEL[p], value: d.byPriority[p], color: PRIO_COLOR[p] }))} />
                <div className="legend">{(Object.keys(d.byPriority) as Priority[]).map(p => <span key={p}><i style={{ background: PRIO_COLOR[p] }} />{PRIORITY_LABEL[p]} {d.byPriority[p]}</span>)}</div>
              </div>
            </section>
          </div>
        )}
        {tab === "orang" && (
          <section className="surface"><div className="surface-h"><h2>Produktivitas per orang</h2></div>
            <div style={{ overflowX: "auto" }}><table className="tbl"><thead><tr><th>Nama</th><th className="r">Tugas</th><th className="r">Selesai</th><th className="r">Tepat waktu</th><th className="r">Telat</th><th className="r">Terlambat (buka)</th><th style={{ width: "28%" }}>Progres</th></tr></thead>
              <tbody>{d.perPerson.map(p => (
                <tr key={p.email}><td><b>{p.name}</b></td><td className="r">{p.total}</td><td className="r">{p.done}</td><td className="r">{p.onTime + p.late ? Math.round(p.onTime / (p.onTime + p.late) * 100) + "%" : "–"}</td><td className="r">{p.late}</td><td className="r">{p.overdue}</td>
                  <td><HBar label="" done={p.done} total={p.total} max={maxP} /></td></tr>
              ))}</tbody></table></div>
            {!d.perPerson.length && <p className="empty">Belum ada data.</p>}
          </section>
        )}
        {tab === "proyek" && (
          <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <section className="surface"><div className="surface-h"><h2>Per proyek</h2></div>
              {d.byProject.map(b => { const p = projects.find(x => x.id === b.projectId); return <HBar key={b.projectId ?? "none"} label={p?.name ?? "Tanpa proyek"} done={b.done} total={b.total} max={maxProj} tint={p?.color} />; })}
              {!d.byProject.length && <p className="empty">Belum ada data.</p>}
            </section>
            <section className="surface"><div className="surface-h"><h2>Per label</h2></div>
              {d.byLabel.map(b => { const l = labels.find(x => x.id === b.labelId); return l ? <HBar key={b.labelId} label={"#" + l.name} done={b.done} total={b.total} max={maxProj} tint={l.color} /> : null; })}
              {!d.byLabel.length && <p className="empty">Belum ada tugas berlabel.</p>}
            </section>
          </div>
        )}
      </>}
    </Page>
  );
}

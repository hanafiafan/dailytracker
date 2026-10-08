import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ExternalLink, Printer } from "lucide-react";
import { Page } from "../components/Page";
import { hm } from "../components/TimeTracker";
import { Empty } from "../components/ui";
import { fmtShort, host } from "../lib/format";
import { useMeta, useProjectReport } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";

const day = (ms: number) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));

/** Printable closing report: summary, figures, and every finished task with the proof attached to it. */
export function ProjectReportPage() {
  const [, params] = useRoute("/proyek/:id");
  const id = params?.id ?? "";
  const q = useProjectReport(id), d = q.data;
  const { member } = useViewer(), { openTask } = useUi();
  const owner = useMeta(true).data?.owner;
  const [zoom, setZoom] = useState<string | null>(null);
  if (!d) return <Page title="Laporan proyek"><p className="muted">{q.isError ? "Proyek tidak ditemukan." : "Memuat…"}</p></Page>;
  const { project: p, stats: s, tasks } = d, done = tasks.filter(t => t.status === "done"), open = tasks.filter(t => t.status !== "done");
  const closer = p.closedBy ? member(p.closedBy)?.name ?? (p.closedBy === owner?.email ? owner.name : p.closedBy) : null;
  return (
    <Page title={p.name} sub={p.closedAt ? `Selesai ${day(p.closedAt)}${closer ? " · ditutup oleh " + closer : ""}` : p.description || "Proyek masih berjalan"}
      actions={<><Link className="btn small ghost" href="/proyek"><ArrowLeft size={14} />Semua proyek</Link><button className="btn small" onClick={() => window.print()}><Printer size={14} />Cetak</button></>}
      tabs={[{ id: "r", label: p.closedAt ? "Laporan akhir" : "Detail proyek" }]} tab="r">
      {(p.summary || p.links.length > 0) && (
        <section className="bc" data-c={p.color}>
          <div className="bc-h"><h3>Ringkasan hasil</h3></div>
          {p.summary && <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{p.summary}</p>}
          {p.links.length > 0 && <div className="chips">{p.links.map(l => <a key={l} className="chip" href={l} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{host(l)}</a>)}</div>}
        </section>
      )}
      <div className="statrow bc" style={{ display: "flex", flexWrap: "wrap", gap: "14px 36px" }}>
        <div className="stat"><span className="v">{s.done}<small className="muted" style={{ fontSize: "1rem" }}>/{s.total}</small></span><span className="k">tugas selesai</span></div>
        <div className="stat"><span className="v">{s.done ? Math.round(s.onTime / s.done * 100) + "%" : "–"}</span><span className="k">tepat waktu ({s.onTime})</span></div>
        <div className="stat"><span className="v">{s.done ? Math.round(s.withProof / s.done * 100) + "%" : "–"}</span><span className="k">punya bukti</span></div>
        <div className="stat"><span className="v">{s.minutes ? hm(s.minutes) : "–"}</span><span className="k">waktu tercatat</span></div>
        <div className="stat"><span className="v">{s.revisions}</span><span className="k">kali revisi</span></div>
        <div className="stat"><span className="v" style={{ color: s.open ? "var(--bad)" : undefined }}>{s.open}</span><span className="k">belum selesai</span></div>
      </div>
      <section className="bc">
        <div className="bc-h"><h3>Hasil per tugas</h3><span className="muted">{done.length}</span></div>
        <div className="proofgrid">
          {done.map(t => (
            <article key={t.id} className="proofcard">
              {t.hasPhoto ? <button className="thumbbig" onClick={() => setZoom(t.id)} aria-label={`Perbesar bukti ${t.title}`}><img src={`/api/tasks/${t.id}/proof`} alt="" loading="lazy" /></button> : <div className="thumbbig empty">Tanpa foto</div>}
              <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                <button className="linkbtn clamp2" style={{ textAlign: "left", textDecoration: "none", fontSize: ".9rem" }} onClick={() => openTask(t.id)}>{t.title}</button>
                <small className="muted">{t.name} · {fmtShort(t.date)}{t.minutes ? " · " + hm(t.minutes) : ""} · {PRIORITY_LABEL[t.priority]}{t.revisions ? ` · revisi ${t.revisions}×` : ""}</small>
                {t.proofLink && <a className="chip" style={{ width: "fit-content" }} href={t.proofLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{host(t.proofLink)}</a>}
                {t.report && <p className="clamp3" style={{ fontSize: ".8rem", color: "var(--muted)" }}>{t.report}</p>}
              </div>
            </article>))}
        </div>
        {!done.length && <Empty art="tasks" title="Belum ada tugas selesai" />}
      </section>
      {open.length > 0 && (
        <section className="bc"><div className="bc-h"><h3>Belum selesai</h3><span className="muted">{open.length}</span></div>
          <ul className="alist">{open.map(t => <li key={t.id} className="arow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><button className="linkbtn clamp1" style={{ textAlign: "left", textDecoration: "none" }} onClick={() => openTask(t.id)}>{t.title}</button><small className="muted">{t.name}</small></li>)}</ul>
        </section>
      )}
      {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(null)}><img src={`/api/tasks/${zoom}/proof`} alt="Foto bukti" /></div>}
    </Page>
  );
}

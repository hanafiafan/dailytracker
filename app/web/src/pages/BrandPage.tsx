import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { api, ok } from "../lib/api";
import { keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";

/** One tab per brand (entity): its service catalog, and its clients split into active and history, derived from the projects. */
export function BrandPage() {
  const { entities, projects, member, policy } = useViewer();
  const [pick, setPick] = useState(""), [show, setShow] = useState<"active" | "history" | "all">("active"), [edit, setEdit] = useState<string | null>(null);
  const save = useAction((v: { id: string; services: string[] }) => ok(api.meta.entities[":id"].$patch({ param: { id: v.id }, json: { services: v.services } })), { done: "Layanan brand disimpan", refresh: [keys.meta] });
  const [, go] = useLocation();
  const brand = entities.find(e => e.id === pick) ?? entities[0];

  const data = useMemo(() => {
    if (!brand) return null;
    const mine = projects.filter(p => p.entityId === brand.id), live = (p: (typeof mine)[number]) => !p.closedAt && !p.archived;
    const byClient = new Map<string, typeof mine>();
    for (const p of mine) if (p.clientEmail) byClient.set(p.clientEmail, [...(byClient.get(p.clientEmail) ?? []), p]);
    const clients = [...byClient].map(([email, ps]) => ({ email, ps, active: ps.some(live), since: Math.min(...ps.map(p => p.createdAt)) }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.since - b.since);
    return { mine, live, clients, noClient: mine.filter(p => !p.clientEmail).length };
  }, [brand, projects]);

  if (!brand || !data) return <Page title="Brand" sub="Belum ada brand"><div className="bc"><Empty art="tasks" title="Belum ada brand">Superadmin dapat menambah brand di menu Superadmin → Entitas.</Empty></div></Page>;
  const { mine, live, clients, noClient } = data, activeN = clients.filter(c => c.active).length;
  const rows = clients.filter(c => show === "all" || (show === "active") === c.active);

  return (
    <Page title="Brand" sub="Layanan, client aktif, dan riwayat client per brand"
      tabs={entities.map(e => ({ id: e.id, label: e.id }))} tab={brand.id} onTab={setPick}>
      <section className="bc" data-c={brand.color}>
        <div className="bc-h"><h2>{brand.name}</h2></div>
        <p className="muted">{brand.description || "Tanpa deskripsi"}</p>
        {edit !== null ? (
          <form onSubmit={e => { e.preventDefault(); save.mutate({ id: brand.id, services: edit.split("\n").map(s => s.trim()).filter(Boolean) }, { onSuccess: () => setEdit(null) }); }}>
            <label className="field"><span>Jenis layanan (satu per baris)</span><textarea className="input" rows={5} value={edit} onChange={e => setEdit(e.target.value)} autoFocus /></label>
            <div className="chips"><button className="btn small primary" disabled={save.isPending}>Simpan</button><button type="button" className="btn small ghost" onClick={() => setEdit(null)}>Batal</button></div>
          </form>
        ) : <div className="chips" style={{ marginTop: 8 }}>
          {brand.services.length ? brand.services.map(s => <span key={s} className="chip">{s}</span>) : <span className="muted">Belum ada jenis layanan. Superadmin dapat mengisinya di menu Klik Ubah layanan untuk mengisinya.</span>}
          {policy.canManageBrand() && <button className="btn small ghost" onClick={() => setEdit(brand.services.join("\n"))}>Ubah layanan</button>}
        </div>}
        <div className="nums" style={{ marginTop: 14 }}>
          <div><b>{activeN}</b><small>Client aktif</small></div>
          <div><b>{clients.length - activeN}</b><small>Client riwayat</small></div>
          <div><b>{mine.filter(live).length}</b><small>Proyek berjalan</small></div>
          <div><b>{mine.length - mine.filter(live).length}</b><small>Proyek selesai</small></div>
        </div>
      </section>

      <section className="bc">
        <div className="bc-h"><h2>Client</h2>
          <div className="seg" role="group" aria-label="Filter client">
            <button aria-pressed={show === "active"} onClick={() => setShow("active")}>Aktif ({activeN})</button>
            <button aria-pressed={show === "history"} onClick={() => setShow("history")}>Riwayat ({clients.length - activeN})</button>
            <button aria-pressed={show === "all"} onClick={() => setShow("all")}>Semua ({clients.length})</button>
          </div>
        </div>
        {rows.length ? rows.map(({ email, ps, active, since }) => {
          const m = member(email);
          return (
            <div key={email} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px", minWidth: 0 }}>
                {m && <Avatar m={m} />}<span style={{ minWidth: 0 }}><b className="clamp1">{m?.name ?? email}</b>
                  <small className="muted" style={{ display: "block" }}>Sejak {new Date(since).toLocaleDateString("id-ID", { month: "short", year: "numeric" })} · {ps.length} proyek</small></span>
              </span>
              <span className="chips" style={{ flex: "2 1 260px" }}>
                {ps.map(p => <button key={p.id} className={"chip" + (live(p) ? "" : " muted")} onClick={() => go("/proyek/" + p.id)}>{p.name}{live(p) ? "" : " · selesai"}</button>)}
              </span>
              <span className={"pj-health " + (active ? "ok" : "done")}>{active ? "Aktif" : "Riwayat"}</span>
            </div>);
        }) : <Empty art="tasks" title={show === "history" ? "Belum ada riwayat client" : "Belum ada client"}>Pilih brand dan akun client saat membuat proyek agar tampil di sini.</Empty>}
        {noClient > 0 && <p className="muted" style={{ marginTop: 10 }}>{noClient} proyek brand ini belum punya akun client.</p>}
      </section>
    </Page>
  );
}

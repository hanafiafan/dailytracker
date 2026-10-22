import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Color, ProjectDTO } from "@shared/schemas";
import { ColorPicker } from "./ColorPicker";
import { Avatar } from "./ui";
import { api, ok } from "../lib/api";
import { keys, useAction, useProjectServices } from "../lib/queries";
import { useViewer } from "../lib/viewer";

interface Row { key: string; id?: string; name: string; targetQty: string; unit: string; picEmails: string[] }
const PRESETS: [string, string][] = [["Foto produk", "foto"], ["Video", "video"], ["Desain", "desain"], ["Konten sosmed", "konten"], ["Website", "halaman"]];
const blank = (name = "", unit = ""): Row => ({ key: crypto.randomUUID(), name, targetQty: "", unit, picEmails: [] });

/** Create or edit a project in one dialog: who, when, and what the client bought (services with a target and the people in charge). */
export function ProjectSetup({ project, onClose }: { project?: ProjectDTO; onClose: () => void }) {
  const { me, team, member } = useViewer();
  const existing = useProjectServices(project?.id ?? null);
  const clients = team.filter(m => m.accountType === "client"), staff = team.filter(m => m.accountType !== "client");
  const managers = staff.filter(m => m.isAdmin || /project manager|owner|direktur|bo\b/i.test(m.role + " " + m.level));
  const [name, setName] = useState(project?.name ?? ""), [client, setClient] = useState(project?.clientEmail ?? ""), [pm, setPm] = useState(project?.pmEmail ?? me.email);
  const [startDate, setStart] = useState(project?.startDate ?? ""), [dueDate, setDue] = useState(project?.dueDate ?? "");
  const [description, setDescription] = useState(project?.description ?? ""), [color, setColor] = useState<string>(project?.color ?? "lilac");
  const [rows, setRows] = useState<Row[]>([]), [loaded, setLoaded] = useState(!project), [more, setMore] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);

  useEffect(() => {
    if (project && !loaded && existing.data) {
      setRows(existing.data.map(s => ({ key: s.id, id: s.id, name: s.name, targetQty: s.targetQty ? String(s.targetQty) : "", unit: s.unit, picEmails: s.picEmails })));
      setLoaded(true);
    }
  }, [project, loaded, existing.data]);

  const patch = (key: string, p: Partial<Row>) => setRows(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));
  const drop = (r: Row) => { if (r.id) setRemoved(x => [...x, r.id!]); setRows(l => l.filter(x => x.key !== r.key)); };

  const save = useAction(async () => {
    const body = { name: name.trim(), description: description.trim(), color: color as Color, clientEmail: client || null, pmEmail: pm || null, startDate: startDate || null, dueDate: dueDate || null };
    let id = project?.id;
    if (id) await ok(api.meta.projects[":id"].$patch({ param: { id }, json: body }));
    else id = ((await ok(api.meta.projects.$post({ json: body }))) as { id: string }).id;
    for (const sid of removed) await ok(api.meta.projects[":id"].services[":sid"].$delete({ param: { id, sid } }));
    for (const r of rows.filter(x => x.name.trim())) {
      const json = { name: r.name.trim(), targetQty: Number(r.targetQty) || 0, unit: r.unit.trim(), picEmails: r.picEmails };
      if (r.id) await ok(api.meta.projects[":id"].services[":sid"].$patch({ param: { id, sid: r.id }, json }));
      else await ok(api.meta.projects[":id"].services.$post({ param: { id }, json: { ...json, description: "", status: "todo" as const } }));
    }
  }, { done: project ? "Proyek diperbarui" : "Proyek dibuat", refresh: [keys.meta, keys.analytics] });

  const submit = () => {
    if (!name.trim()) return void toast.error("Nama proyek harus diisi");
    if (startDate && dueDate && startDate > dueDate) return void toast.error("Tenggat harus setelah tanggal mulai");
    save.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog wide" role="dialog" aria-label={project ? "Ubah proyek" : "Proyek baru"}>
        <form style={{ display: "contents" }} onSubmit={e => { e.preventDefault(); submit(); }}>
          <div className="dialog-h"><div><h2>{project ? "Ubah proyek" : "Proyek baru"}</h2><p className="muted">Isi yang perlu dulu; sisanya bisa dilengkapi nanti.</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></div>
          <div className="dialog-b">
            <section className="dsec">
              <label className="field"><span>Nama proyek</span><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="mis. Foto produk Toko Maju" maxLength={60} autoFocus required /></label>
              <div className="grid2">
                <label className="field"><span>Akun client</span>
                  <select className="input" value={client} onChange={e => setClient(e.target.value)}>
                    <option value="">{clients.length ? "Tanpa client" : "Belum ada akun client"}</option>
                    {clients.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                  </select></label>
                <label className="field"><span>Penanggung jawab (PM)</span>
                  <select className="input" value={pm} onChange={e => setPm(e.target.value)}>
                    <option value="">Belum ditentukan</option>
                    {(managers.length ? managers : staff).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                  </select></label>
                <label className="field"><span>Mulai</span><input className="input" type="date" value={startDate} onChange={e => setStart(e.target.value)} /></label>
                <label className="field"><span>Tenggat</span><input className="input" type="date" value={dueDate} min={startDate || undefined} onChange={e => setDue(e.target.value)} /></label>
              </div>
            </section>

            <section className="dsec">
              <div className="dsec-h"><h3>Layanan yang diambil</h3><span className="muted">Target dan PIC dipakai untuk progres otomatis</span></div>
              {loaded ? rows.map(r => (
                <div key={r.key} className="svcrow">
                  <input className="input" aria-label="Nama layanan" value={r.name} onChange={e => patch(r.key, { name: e.target.value })} placeholder="Nama layanan" maxLength={80} />
                  <input className="input num" aria-label="Target jumlah" type="number" min={0} max={100000} inputMode="numeric" value={r.targetQty} onChange={e => patch(r.key, { targetQty: e.target.value })} placeholder="Target" />
                  <input className="input unit" aria-label="Satuan" value={r.unit} onChange={e => patch(r.key, { unit: e.target.value })} placeholder="satuan" maxLength={20} />
                  <button type="button" className="iconbtn" aria-label="Hapus layanan" onClick={() => drop(r)}><Trash2 size={15} /></button>
                  <div className="picrow">
                    <span className="lbl">PIC</span>
                    {r.picEmails.map(e => { const m = member(e); return <button type="button" key={e} className="chip" aria-label={`Lepas ${m?.name ?? e}`} onClick={() => patch(r.key, { picEmails: r.picEmails.filter(x => x !== e) })}>{m && <Avatar m={m} />}{m?.name ?? e}<X size={12} /></button>; })}
                    <select className="input picadd" aria-label="Tambah PIC" value="" onChange={e => e.target.value && patch(r.key, { picEmails: [...r.picEmails, e.target.value] })}>
                      <option value="">+ Tambah PIC</option>
                      {staff.filter(m => !r.picEmails.includes(m.email)).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              )) : <p className="muted">Memuat layanan…</p>}
              <div className="chips">
                {PRESETS.map(([n, u]) => <button type="button" key={n} className="chip" onClick={() => setRows(r => [...r, blank(n, u)])}><Plus size={12} />{n}</button>)}
                <button type="button" className="chip" onClick={() => setRows(r => [...r, blank()])}><Plus size={12} />Layanan lain</button>
              </div>
            </section>

            <section className="dsec">
              <button type="button" className="linkbtn" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Sembunyikan" : "Deskripsi dan warna"}</button>
              {more && <>
                <label className="field"><span>Deskripsi</span><textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} maxLength={300} placeholder="Cakupan atau catatan proyek" /></label>
                <label className="field"><span>Warna</span><ColorPicker value={color} onChange={setColor} /></label>
              </>}
            </section>
          </div>
          <footer className="dialog-f"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={save.isPending}>{save.isPending ? "Menyimpan…" : project ? "Simpan perubahan" : "Buat proyek"}</button></footer>
        </form>
      </div>
    </>
  );
}

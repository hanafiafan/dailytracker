import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Color, ProjectDTO } from "@shared/schemas";
import { ColorPicker } from "./ColorPicker";
import { Avatar } from "./ui";
import { api, ok } from "../lib/api";
import { keys, useAction, useProjectServices } from "../lib/queries";
import { unitsOf } from "@shared/policy";
import { useViewer } from "../lib/viewer";
import { today } from "../lib/format";

interface Row { key: string; id?: string; name: string; targetQty: string; unit: string; picEmails: string[] }
const PRESETS: [string, string][] = [["Foto produk", "foto"], ["Video", "video"], ["Desain", "desain"], ["Konten sosmed", "konten"], ["Website", "halaman"]];
const blank = (name = "", unit = ""): Row => ({ key: crypto.randomUUID(), name, targetQty: "", unit, picEmails: [] });

/** Create or edit a project in one dialog: who, when, and what the client bought (services with a target and the people in charge). */
export function ProjectSetup({ project, defaultEntityId, onClose }: { project?: ProjectDTO; defaultEntityId?: string; onClose: () => void }) {
  const { me, team, member, entities } = useViewer();
  const existing = useProjectServices(project?.id ?? null);
  const clients = team.filter(m => m.accountType === "client"), staff = team.filter(m => m.accountType !== "client");
  const managers = staff.filter(m => m.isAdmin || /project manager|owner|direktur|bo\b/i.test(m.role + " " + m.level));
  const [name, setName] = useState(project?.name ?? ""), [client, setClient] = useState(project?.clientEmail ?? ""), [pm, setPm] = useState(project?.pmEmail ?? me.email), [entityId, setEntity] = useState(project?.entityId ?? defaultEntityId ?? (unitsOf(member(me.email) ?? { group: "" }).find(u => entities.some(e => e.id === u)) ?? ""));
  const [startDate, setStart] = useState(project?.startDate ?? ""), [dueDate, setDue] = useState(project?.dueDate ?? "");
  const [description, setDescription] = useState(project?.description ?? ""), [color, setColor] = useState<string>(project?.color ?? "lilac");
  const [rows, setRows] = useState<Row[]>([]), [loaded, setLoaded] = useState(!project), [more, setMore] = useState(false);
  const [autoCreateTasks, setAutoCreateTasks] = useState(true);
  const brandServices = entities.find(e => e.id === entityId)?.services ?? [];
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
    const body = { name: name.trim(), description: description.trim(), color: color as Color, clientEmail: client || null, entityId: entityId || null, pmEmail: pm || null, startDate: startDate || null, dueDate: dueDate || null };
    let id = project?.id;
    if (id) await ok(api.meta.projects[":id"].$patch({ param: { id }, json: body }));
    else id = ((await ok(api.meta.projects.$post({ json: body }))) as { id: string }).id;
    for (const sid of removed) await ok(api.meta.projects[":id"].services[":sid"].$delete({ param: { id, sid } }));

    let createdTasksCount = 0;
    for (const r of rows.filter(x => x.name.trim())) {
      const json = { name: r.name.trim(), targetQty: Number(r.targetQty) || 0, unit: r.unit.trim(), picEmails: r.picEmails };
      let serviceId = r.id;
      const isNewService = !serviceId;
      if (serviceId) {
        await ok(api.meta.projects[":id"].services[":sid"].$patch({ param: { id, sid: serviceId }, json }));
      } else {
        const created = (await ok(api.meta.projects[":id"].services.$post({ param: { id }, json: { ...json, description: "", status: "todo" as const } }))) as { id: string };
        serviceId = created.id;
      }

      // Automatically connect PICs to their daily task list
      if (autoCreateTasks && r.picEmails.length > 0) {
        const oldService = existing.data?.find(s => s.id === r.id);
        const oldPics = new Set(oldService?.picEmails ?? []);
        const targetPics = isNewService ? r.picEmails : r.picEmails.filter(e => !oldPics.has(e));

        const targetQty = Number(r.targetQty) || 0;
        const unit = r.unit.trim();
        const taskDate = startDate && startDate > today() ? startDate : today();

        for (const picEmail of targetPics) {
          try {
            await ok(api.tasks.$post({
              json: {
                emails: [picEmail],
                title: `${r.name.trim()} · ${name.trim()}`,
                note: `Ditugaskan dari proyek "${name.trim()}". Layanan: ${r.name.trim()}${targetQty ? ` · Target: ${targetQty} ${unit}` : ""}${dueDate ? ` · Tenggat: ${dueDate}` : ""}.`,
                date: taskDate,
                dueDate: (dueDate && dueDate > taskDate) ? dueDate : undefined,
                projectId: id,
                serviceId,
                needProof: true,
                priority: "normal",
              }
            }));
            createdTasksCount++;
          } catch (e) {
            console.warn("Gagal membuat tugas harian otomatis untuk PIC:", e);
          }
        }
      }
    }
    if (createdTasksCount > 0) {
      toast.success(`${createdTasksCount} tugas harian berhasil dibuat untuk PIC`);
    }
  }, { done: project ? "Proyek diperbarui" : "Proyek dibuat", refresh: [keys.meta, keys.analytics, keys.tasks] });

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
              <label className="field">
                <span>Nama proyek</span>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="mis. Foto produk Toko Maju" maxLength={60} autoFocus required />
              </label>
              <div className="grid2">
                <label className="field">
                  <span>Brand</span>
                  <select className="input" value={entityId} onChange={e => setEntity(e.target.value)}>
                    <option value="">Tanpa brand</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Akun client</span>
                  <select className="input" value={client} onChange={e => setClient(e.target.value)}>
                    <option value="">{clients.length ? "Tanpa client" : "Belum ada akun client"}</option>
                    {clients.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Penanggung jawab (PM)</span>
                  <select className="input" value={pm} onChange={e => setPm(e.target.value)}>
                    <option value="">Belum ditentukan</option>
                    {(managers.length ? managers : staff).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Mulai</span>
                  <input className="input" type="date" value={startDate} onChange={e => setStart(e.target.value)} />
                </label>
                <label className="field">
                  <span>Tenggat</span>
                  <input className="input" type="date" value={dueDate} min={startDate || undefined} onChange={e => setDue(e.target.value)} />
                </label>
              </div>
            </section>

            <section className="dsec">
              <div className="dsec-h">
                <div>
                  <h3>Layanan yang diambil</h3>
                  <span className="muted">Target & satuan (mis. 50 foto) dipakai untuk menghitung progres proyek</span>
                </div>
              </div>

              {loaded ? rows.map(r => (
                <div key={r.key} className="svcrow">
                  <input className="input" aria-label="Nama layanan" value={r.name} onChange={e => patch(r.key, { name: e.target.value })} placeholder="Nama layanan (mis. Foto katalog)" maxLength={80} />
                  <input className="input num" aria-label="Target jumlah" type="number" min={0} max={100000} inputMode="numeric" value={r.targetQty} onChange={e => patch(r.key, { targetQty: e.target.value })} placeholder="Target (mis. 50)" />
                  <input className="input unit" aria-label="Satuan" value={r.unit} onChange={e => patch(r.key, { unit: e.target.value })} placeholder="Satuan (mis. foto)" maxLength={20} />
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
                {(brandServices.length ? brandServices.map((n): [string, string] => [n, ""]) : PRESETS).map(([n, u]) => <button type="button" key={n} className="chip" onClick={() => setRows(r => [...r, blank(n, u)])}><Plus size={12} />{n}</button>)}
                <button type="button" className="chip" onClick={() => setRows(r => [...r, blank()])}><Plus size={12} />Layanan lain</button>
              </div>

              <label className="check" style={{ marginTop: 14, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={autoCreateTasks} onChange={e => setAutoCreateTasks(e.target.checked)} style={{ marginTop: 2 }} />
                <div>
                  <span style={{ fontSize: ".84rem", fontWeight: 600 }}>Hubungkan ke tugas harian PIC otomatis</span>
                  <small className="muted" style={{ display: "block", fontSize: ".76rem", marginTop: 1 }}>
                    Tugas perdana otomatis tampil di Dasbor dan Papan kerja PIC yang ditugaskan.
                  </small>
                </div>
              </label>
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

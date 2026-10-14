import { type Color, type LabelDTO, type ProjectDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { keys, useAction } from "../lib/queries";
import { colorHex } from "../lib/tasks";
import { useViewer } from "../lib/viewer";
import { ConfirmButton } from "./ui";
import { ColorPicker } from "./ColorPicker";

function ProjectRow({ p }: { p: ProjectDTO }) {
  const { policy } = useViewer();
  const patch = useAction((j: Partial<Pick<ProjectDTO, "name" | "color" | "archived">>) => ok(api.meta.projects[":id"].$patch({ param: { id: p.id }, json: j })), { refresh: [keys.meta] });
  const del = useAction(() => ok(api.meta.projects[":id"].$delete({ param: { id: p.id } })), { done: "Proyek dihapus", refresh: [keys.meta, keys.tasks] });
  return (
    <div className="mrow">
      <span className="avatar sm" style={{ background: colorHex(p.color), width: 28, height: 28, flexShrink: 0 }} />
      <input className="input" style={{ flex: "1 1 160px", width: "auto" }} defaultValue={p.name} maxLength={60} aria-label="Nama proyek" onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.name && patch.mutate({ name: e.target.value.trim() })} />
      <ColorPicker compact value={p.color} onChange={c => patch.mutate({ color: c })} />
      <button className="btn small" onClick={() => patch.mutate({ archived: !p.archived })}>{p.archived ? "Aktifkan" : "Arsipkan"}</button>
      {policy.isBoss && <ConfirmButton className="btn small danger" label="Hapus" armed="Yakin hapus?" onConfirm={() => del.mutate()} />}
    </div>
  );
}
function LabelRow({ l }: { l: LabelDTO }) {
  const patch = useAction((j: Partial<Pick<LabelDTO, "name" | "color">>) => ok(api.meta.labels[":id"].$patch({ param: { id: l.id }, json: j })), { refresh: [keys.meta] });
  const del = useAction(() => ok(api.meta.labels[":id"].$delete({ param: { id: l.id } })), { done: "Label dihapus", refresh: [keys.meta, keys.tasks] });
  return (
    <div className="mrow">
      <span className="avatar sm" style={{ background: colorHex(l.color), width: 28, height: 28, flexShrink: 0 }} />
      <input className="input" style={{ flex: "1 1 160px", width: "auto" }} defaultValue={l.name} maxLength={30} aria-label="Nama label" onBlur={e => e.target.value.trim() && e.target.value.trim() !== l.name && patch.mutate({ name: e.target.value.trim() })} />
      <ColorPicker compact value={l.color} onChange={c => patch.mutate({ color: c })} />
      <ConfirmButton className="btn small danger" label="Hapus" armed="Yakin hapus?" onConfirm={() => del.mutate()} />
    </div>
  );
}

export function ProjectsLabels() {
  const { projects, labels } = useViewer();
  const addP = useAction((f: FormData) => ok(api.meta.projects.$post({ json: { name: String(f.get("name")), color: String(f.get("color")) as Color } })), { done: "Proyek ditambahkan", refresh: [keys.meta] });
  const addL = useAction((f: FormData) => ok(api.meta.labels.$post({ json: { name: String(f.get("name")), color: String(f.get("color")) as Color } })), { done: "Label ditambahkan", refresh: [keys.meta] });
  const form = (add: typeof addP, ph: string) => (
    <form className="row" style={{ paddingTop: 12, alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); const f = e.currentTarget; if (String(new FormData(f).get("name")).trim()) add.mutate(new FormData(f), { onSuccess: () => f.reset() }); }}>
      <label className="field" style={{ flex: "1 1 180px" }}><span>Nama</span><input className="input" name="name" placeholder={ph} maxLength={60} /></label>
      <label className="field" style={{ flex: "0 0 auto" }}><span>Warna</span><ColorPicker name="color" defaultValue={ph.includes("Video") ? "gray" : "lilac"} /></label>
      <button className="btn primary" type="submit">Tambah</button>
    </form>
  );
  return (
    <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
      <section className="surface"><div className="surface-h"><h2>Proyek &amp; kampanye</h2></div>
        <p className="foot">Kelompokkan tugas per kampanye. Warna proyek dipakai di papan dan kalender.</p>
        {projects.map(p => <ProjectRow key={p.id} p={p} />)}
        {!projects.length && <p className="empty">Belum ada proyek.</p>}
        {form(addP, "Contoh: Kampanye Lebaran")}
      </section>
      <section className="surface"><div className="surface-h"><h2>Label</h2></div>
        <p className="foot">Penanda lintas proyek, mis. Foto, Video, Revisi.</p>
        {labels.map(l => <LabelRow key={l.id} l={l} />)}
        {!labels.length && <p className="empty">Belum ada label.</p>}
        {form(addL, "Contoh: Video")}
      </section>
    </div>
  );
}

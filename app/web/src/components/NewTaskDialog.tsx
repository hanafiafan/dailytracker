import { useState } from "react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { keys, useAction } from "../lib/queries";
import { PRIORITY_LABEL } from "../lib/tasks";
import { useViewer, type NewTaskPrefill } from "../lib/viewer";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

/** Create a task (or a repeating routine) with schedule, priority, project, labels, and a checklist. */
export function NewTaskDialog({ prefill, date, onClose }: { prefill: NewTaskPrefill; date: string; onClose: () => void }) {
  const { me, team, policy, projects, labels } = useViewer();
  const manager = policy.isManager;
  const people = team.filter(m => !m.isAdmin && policy.canManage(m.email));
  const [sel, setSel] = useState(new Set(manager ? prefill.emails ?? [] : [me.email]));
  const [priority, setPriority] = useState<Priority>("normal");
  const [proof, setProof] = useState(true), [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [lab, setLab] = useState(new Set<string>());
  const [start, setStart] = useState(prefill.start ?? ""), [due, setDue] = useState(prefill.due ?? "");

  const save = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [...sel], title: String(f.get("title")), note: String(f.get("note") ?? ""), date: routine ? undefined : String(f.get("date") || date),
    start: start || null, due: due || null, priority, projectId: String(f.get("project") || "") || null, labelIds: [...lab],
    subtasks: String(f.get("subtasks") ?? "").split("\n").map(s => s.trim()).filter(Boolean),
    needProof: proof, routineDays: routine ? [...days].sort() : undefined,
  } })), { done: routine ? "Tugas rutin disimpan" : sel.size > 1 ? `Tugas dibagikan ke ${sel.size} orang` : "Tugas dibuat", refresh: [keys.tasks, keys.team, keys.routines, keys.activity] });

  const submit = (f: FormData) => {
    if (!sel.size) return void toast.error("Pilih minimal satu orang");
    if (!String(f.get("title")).trim()) return void toast.error("Tulis judul tugasnya dulu");
    if (start && due && start >= due) return void toast.error("Jam selesai harus setelah jam mulai");
    if (routine && !days.size) return void toast.error("Pilih hari untuk tugas rutin");
    save.mutate(f, { onSuccess: onClose });
  };
  const all = people.length > 0 && sel.size === people.length;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="dialog" role="dialog" aria-label="Tugas baru" onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
        <h2>{manager ? "Tugas baru" : "Tugas untukku"}</h2>
        {manager && (
          <div className="field"><span>Untuk siapa</span>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={all} onClick={() => setSel(all ? new Set() : new Set(people.map(p => p.email)))}>Semua</button>
              {people.map(m => <button type="button" key={m.email} className="chip" aria-pressed={sel.has(m.email)} onClick={() => setSel(toggle(sel, m.email))}>{m.name}</button>)}
            </div>
          </div>
        )}
        <label className="field"><span>Tugas</span><input className="input" name="title" autoFocus placeholder="Contoh: Foto produk pashmina warna baru" maxLength={120} /></label>
        {manager && <label className="field"><span>Deskripsi (opsional)</span><textarea className="input" name="note" rows={2} maxLength={600} placeholder="Detail, link brief, atau target" /></label>}
        <div className="row">
          {!routine && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={prefill.date ?? date} /></label>}
          <label className="field"><span>Proyek</span><select className="input" name="project" defaultValue={prefill.projectId ?? ""}><option value="">Tanpa proyek</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        <div className="field"><span>Prioritas</span><div className="chips">{PRIORITIES.map(p => <button type="button" key={p} className="chip" aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}</div></div>
        {labels.length > 0 && <div className="field"><span>Label</span><div className="chips">{labels.map(l => <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}><i className="sw" />{l.name}</button>)}</div></div>}
        <div className="field"><span>Jam kerja (opsional)</span>
          <div className="row" style={{ gap: 10 }}>
            <label className="tl"><span>Mulai</span><input className="input timein" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="tl"><span>Selesai</span><input className="input timein" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
          </div>
          <div className="chips">{PRESETS.map(([lbl, a, b]) => <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>{a ? `${lbl} ${a}–${b}` : lbl}</button>)}</div>
        </div>
        {!routine && <label className="field"><span>Checklist (satu langkah per baris)</span><textarea className="input" name="subtasks" rows={3} placeholder={"Ambil foto\nEdit warna\nUpload ke Drive"} /></label>}
        {manager && <div className="row">
          <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Wajib bukti</label>
          <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin</label>
        </div>}
        {routine && <div className="field"><span>Muncul otomatis setiap</span><div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>{DAYN[d]}</button>)}</div></div>}
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button type="submit" className="btn primary" disabled={save.isPending}>{routine ? "Simpan tugas rutin" : manager ? "Bagikan tugas" : "Simpan"}</button></div>
      </form>
    </>
  );
}

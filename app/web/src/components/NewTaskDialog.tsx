import { loadTemplates, saveTemplates } from "../lib/templates";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { keys, useAction } from "../lib/queries";
import { PRIORITY_LABEL, WARN_OPTIONS } from "../lib/tasks";
import { useViewer, type NewTaskPrefill } from "../lib/viewer";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

/** Create a task (or a repeating routine) with schedule, priority, project, labels, and a checklist. */
export function NewTaskDialog({ prefill, date, onClose, onTemplate }: { prefill: NewTaskPrefill; date: string; onClose: () => void; onTemplate: (p: NewTaskPrefill) => void }) {
  const [, setTpl] = useState(0);
  const templates = loadTemplates();
  const { me, team, policy, projects, labels } = useViewer();
  const manager = policy.isManager;
  // The owner and admins without a unit limit may also give tasks to other admins.
  // Everyone (including managers) may also create tasks for themselves.
  const people = team.filter(m => m.email === me.email || ((!m.isAdmin || (policy.isBoss && m.email !== policy.me)) && policy.canManage(m.email)));
  const [sel, setSel] = useState(() => new Set(prefill.emails && prefill.emails.length > 0 ? prefill.emails : [me.email]));
  const isSelfOnly = sel.size === 1 && sel.has(me.email);
  const [priority, setPriority] = useState<Priority>(prefill.priority ?? "normal");
  const [proof, setProof] = useState(true), [warn, setWarn] = useState(30), [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [lab, setLab] = useState(new Set<string>(prefill.labelIds ?? []));
  const [start, setStart] = useState(prefill.start ?? ""), [due, setDue] = useState(prefill.due ?? "");

  const save = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [...sel], title: String(f.get("title")), note: String(f.get("note") ?? ""), date: routine ? undefined : String(f.get("date") || date),
    start: start || null, due: due || null, priority, projectId: String(f.get("project") || "") || null, labelIds: [...lab],
    subtasks: String(f.get("subtasks") ?? "").split("\n").map(s => s.trim()).filter(Boolean),
    needProof: proof, warnMin: manager && due && !routine ? warn : null, routineDays: routine ? [...days].sort() : undefined,
  } })), { done: routine ? "Tugas rutin disimpan" : sel.size === 1 && sel.has(me.email) ? "Tugas mandiri berhasil dibuat" : sel.size > 1 ? `Tugas dibagikan ke ${sel.size} orang` : "Tugas dibuat", refresh: [keys.tasks, keys.team, keys.routines, keys.activity] });

  const submit = (f: FormData) => {
    if (!sel.size) return void toast.error("Pilih minimal satu orang");
    if (!String(f.get("title")).trim()) return void toast.error("Tulis judul tugasnya dulu");
    if (start && due && start >= due) return void toast.error("Jam selesai harus setelah jam mulai");
    if (routine && !days.size) return void toast.error("Pilih hari untuk tugas rutin");
    save.mutate(f, { onSuccess: onClose });
  };
  const others = people.filter(p => p.email !== me.email);
  const allTeam = others.length > 0 && others.every(p => sel.has(p.email));
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Tugas baru"><form style={{ display: "contents" }} onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
        <div className="dialog-h"><div><h2>{isSelfOnly ? "Tugas mandiri" : manager ? "Tugas baru" : "Tugas untukku"}</h2><p className="muted">{isSelfOnly ? "Catatan pekerjaan untuk diri sendiri." : manager ? "Bagikan pekerjaan ke satu orang atau lebih." : "Catatan pekerjaan pribadimu."}</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></div>
        <div className="dialog-b">
          {manager && (
            <section className="dsec">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Penerima</h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  {isSelfOnly ? "Tugas untuk Anda sendiri" : sel.size > 0 ? `${sel.size} orang dipilih` : "Pilih penerima"}
                </span>
              </div>
              <div className="seg" role="group" aria-label="Target tugas" style={{ width: "100%", marginBottom: 10 }}>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  aria-pressed={isSelfOnly}
                  onClick={() => setSel(new Set([me.email]))}
                >
                  Untuk Saya Sendiri ({me.member?.name ?? "Saya"})
                </button>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  aria-pressed={!isSelfOnly}
                  onClick={() => {
                    const o = people.filter(p => p.email !== me.email);
                    const first = o[0];
                    setSel(new Set(first ? [first.email] : []));
                  }}
                >
                  Tugaskan ke Tim
                </button>
              </div>

              {!isSelfOnly && (
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={allTeam} onClick={() => {
                    const o = people.filter(p => p.email !== me.email);
                    setSel(sel.size === o.length ? new Set() : new Set(o.map(p => p.email)));
                  }}>
                    Semua Tim
                  </button>
                  {people.filter(m => m.email !== me.email).map(m => (
                    <button type="button" key={m.email} className="chip" aria-pressed={sel.has(m.email)} onClick={() => setSel(toggle(sel, m.email))}>
                      {m.name}
                    </button>
                  ))}
                  <button type="button" className="chip" aria-pressed={sel.has(me.email)} onClick={() => setSel(toggle(sel, me.email))}>
                    + {me.member?.name ?? "Saya"} (Ikut)
                  </button>
                </div>
              )}

              {isSelfOnly && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(99, 102, 241, 0.08)", borderRadius: 8, border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                  <span style={{ fontSize: 13 }}>Ditugaskan untuk: <b>{me.member?.name ?? me.email} (Anda)</b></span>
                </div>
              )}

              {isSelfOnly && policy.needsTaskApproval() && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6, color: "#d97706" }}>Catatan: Tugas mandiri memerlukan persetujuan atasan sebelum bisa dikerjakan.</p>
              )}
            </section>
          )}
          {!manager && policy.needsTaskApproval() && (
            <section className="dsec">
              <p className="muted" style={{ fontSize: 12, color: "#d97706" }}>Catatan: Tugas mandiri memerlukan persetujuan atasan sebelum bisa dikerjakan.</p>
            </section>
          )}
          {templates.length > 0 && (
            <section className="dsec"><h3>Templat</h3>
              <div className="chips">{templates.map((t, i) => <span key={i} className="chip" style={{ paddingRight: 4 }}><button type="button" className="linkbtn" style={{ textDecoration: "none" }} onClick={() => onTemplate({ ...t, emails: [...sel] })}>{t.title}</button><button type="button" className="iconbtn" style={{ width: 22, height: 22 }} aria-label={`Hapus templat ${t.title}`} onClick={() => { saveTemplates(templates.filter((_, j) => j !== i)); setTpl(n => n + 1); }}><X size={12} /></button></span>)}</div>
            </section>
          )}
          <section className="dsec"><h3>Detail</h3>
            <label className="field"><span>Judul</span><input className="input" name="title" autoFocus defaultValue={prefill.title ?? ""} placeholder="Contoh: Foto produk pashmina warna baru" maxLength={120} /></label>
            <label className="field"><span>Deskripsi <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span><textarea className="input" name="note" rows={2} defaultValue={prefill.note ?? ""} maxLength={600} placeholder="Detail, link brief, atau target" /></label>
            <div className="dgrid">
              <div className="field"><span>Prioritas</span><div className="seg" role="group" aria-label="Prioritas" style={{ justifySelf: "start" }}>{PRIORITIES.map(p => <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}</div></div>
              <label className="field"><span>Proyek</span><select className="input" name="project" defaultValue={prefill.projectId ?? ""}><option value="">Tanpa proyek</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            {labels.length > 0 && <div className="field"><span>Label</span><div className="chips">{labels.map(l => <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}><i className="sw" />{l.name}</button>)}</div></div>}
          </section>
          <section className="dsec"><h3>Jadwal</h3>
            <div className="dgrid">
              {!routine && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={prefill.date ?? date} /></label>}
              <div className="timegrid" style={routine ? { gridColumn: "1 / -1" } : undefined}>
                <label className="tl"><span>Mulai</span><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                <label className="tl"><span>Selesai</span><input className="input" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
              </div>
            </div>
            <div className="chips">{PRESETS.map(([lbl, a, b]) => <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>{a ? `${lbl} ${a}–${b}` : lbl}</button>)}</div>
            {manager && <div className="chips" style={{ gap: 18 }}>
              <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin</label>
            </div>}
            {routine && <div className="field"><span>Muncul otomatis setiap</span><div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>{DAYN[d]}</button>)}</div></div>}
          </section>
          {manager && due && !routine && (
            <section className="dsec"><h3>Peringatan tenggat</h3>
              <label className="field"><span>Ingatkan penerima sebelum jam {due}</span><select className="input" value={warn} onChange={e => setWarn(Number(e.target.value))}>{WARN_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l} sebelumnya</option>)}</select></label>
              <p className="muted" style={{ fontSize: ".8rem" }}>Pengingat dikirim ke notifikasi dan lonceng penerima. Kalau tenggat sudah lebih dekat dari ini, tugas langsung ditandai mepet.</p>
            </section>
          )}
          {!routine && (
            <section className="dsec"><h3>Checklist &amp; bukti</h3>
              <label className="field"><span>Langkah <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu per baris)</em></span><textarea className="input" name="subtasks" rows={3} defaultValue={(prefill.steps ?? []).join("\n")} placeholder={"Ambil foto\nEdit warna\nUpload ke Drive"} /></label>
              {manager && <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label>}
            </section>
          )}
          {routine && manager && <section className="dsec"><h3>Bukti</h3><label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label></section>}
        </div>
        <footer className="dialog-f">
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {routine ? "Simpan tugas rutin" : isSelfOnly ? "Simpan tugas mandiri" : manager ? (sel.size > 1 ? `Bagikan ke ${sel.size} orang` : "Kirim tugas") : "Simpan"}
          </button>
        </footer>
      </form></div>
    </>
  );
}

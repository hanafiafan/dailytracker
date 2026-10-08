import { useState } from "react";
import { toast } from "sonner";
import type { MemberDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { useAction } from "../lib/queries";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];

export function AddTaskPanel({ people, date, initial, onClose }: { people: MemberDTO[]; date: string; initial: string[]; onClose: () => void }) {
  const [sel, setSel] = useState(new Set(initial));
  const [hot, setHot] = useState(false), [proof, setProof] = useState(true), [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [start, setStart] = useState(""), [due, setDue] = useState("");
  const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  const save = useAction((f: FormData) => ok(api.tasks.$post({ json: {
    emails: [...sel], title: String(f.get("title")), note: String(f.get("note") ?? ""), date: routine ? undefined : String(f.get("date") || date),
    start: start || null, due: due || null, hot, needProof: proof, routineDays: routine ? [...days].sort() : undefined,
  } })), { done: routine ? "Tugas rutin disimpan" : `Tugas dibagikan ke ${sel.size} orang`, refresh: [["tasks"], ["team"], ["routines"]] });

  const submit = (f: FormData) => {
    if (!sel.size) return void toast.error("Pilih minimal satu orang");
    if (!String(f.get("title")).trim()) return void toast.error("Tulis judul tugasnya dulu");
    if (start && due && start >= due) return void toast.error("Jam selesai harus setelah jam mulai");
    if (routine && !days.size) return void toast.error("Pilih hari untuk tugas rutin");
    save.mutate(f, { onSuccess: onClose });
  };
  const all = people.length > 0 && sel.size === people.length;
  return (
    <section className="panel" aria-label="Tambah tugas">
      <h2>Tugas baru</h2>
      <div className="field"><span>Untuk siapa</span>
        <div className="chips">
          <button className="chip" aria-pressed={all} onClick={() => setSel(all ? new Set() : new Set(people.map(p => p.email)))}>Semua</button>
          {people.map(m => <button key={m.email} className="chip" aria-pressed={sel.has(m.email)} onClick={() => setSel(toggle(sel, m.email))}>{m.name}</button>)}
        </div>
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} style={{ display: "grid", gap: 14 }}>
        <label className="field"><span>Tugas</span><input className="input" name="title" autoFocus placeholder="Contoh: Foto produk pashmina warna baru" maxLength={160} /></label>
        <label className="field"><span>Catatan (opsional)</span><textarea className="input" name="note" rows={2} maxLength={600} placeholder="Detail, link brief, atau target" /></label>
        <div className="row">
          {!routine && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={date} /></label>}
          <label className="check"><input type="checkbox" checked={hot} onChange={e => setHot(e.target.checked)} />Penting</label>
          <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Wajib bukti</label>
          <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin</label>
        </div>
        <div className="field"><span>⏰ Jam kerja (opsional)</span>
          <div className="row" style={{ gap: 10 }}>
            <label className="tl"><span>Mulai</span><input className="input timein" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="tl"><span>Selesai</span><input className="input timein" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
          </div>
          <div className="chips">{PRESETS.map(([lbl, a, b]) => <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>{a ? `${lbl} ${a}–${b}` : lbl}</button>)}</div>
        </div>
        {routine && <div className="field"><span>Muncul otomatis setiap</span>
          <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} type="button" className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>{DAYN[d]}</button>)}</div></div>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="btn primary" disabled={save.isPending}>{routine ? "Simpan tugas rutin" : "Bagikan tugas"}</button>
        </div>
      </form>
    </section>
  );
}

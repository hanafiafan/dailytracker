import { loadTemplates, saveTemplates } from "../lib/templates";
import { useState } from "react";
import { X, Users, Target, Link2, ListChecks, Zap, Flame, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { keys, useAction, useProjectServices } from "../lib/queries";
import { PRIORITY_LABEL, WARN_OPTIONS } from "../lib/tasks";
import { isDirectorMember } from "@shared/policy";
import { useViewer, type NewTaskPrefill } from "../lib/viewer";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

/** Create a task with support for Team Assignment or Self Task. */
export function NewTaskDialog({ prefill, date, onClose, onTemplate }: { prefill: NewTaskPrefill; date: string; onClose: () => void; onTemplate: (p: NewTaskPrefill) => void }) {
  const [, setTpl] = useState(0);
  const templates = loadTemplates();
  const { me, team, policy, projects, labels } = useViewer();
  const manager = policy.isManager;
  const people = team.filter(m => m.accountType !== "client" && (m.email === me.email || ((!m.isAdmin || (policy.isBoss && m.email !== policy.me) || (policy.isBO && isDirectorMember(m))) && policy.canManage(m.email))));

  // Mode: "team" vs "self"
  const [mode, setMode] = useState<"team" | "self">(() => {
    if (prefill.mode) return prefill.mode;
    if (prefill.emails && prefill.emails.length > 0) {
      if (prefill.emails.length === 1 && prefill.emails[0] === me.email) return "self";
      return "team";
    }
    return manager ? "team" : "self";
  });

  const [sel, setSel] = useState(() => new Set(prefill.emails && prefill.emails.length > 0 ? prefill.emails : mode === "team" ? [] : [me.email]));
  const [priority, setPriority] = useState<Priority>(prefill.priority ?? "normal");
  const [chosenProject, setChosenProject] = useState(prefill.projectId ?? "");
  const servicesQ = useProjectServices(chosenProject || null);
  const services = servicesQ.data ?? [];
  const [proof, setProof] = useState(true);
  const [proofSelf, setProofSelf] = useState(false);
  const [warn, setWarn] = useState(30);
  const [warnSelf, setWarnSelf] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [lab, setLab] = useState(new Set<string>(prefill.labelIds ?? []));
  const [start, setStart] = useState(prefill.start ?? "");
  const [due, setDue] = useState(prefill.due ?? "");

  // Self Task States
  const [focusType, setFocusType] = useState<"deep" | "quick" | "routine" | "urgent" | null>(prefill.focusType ?? null);
  const [targetOutput, setTargetOutput] = useState(prefill.targetOutput ?? "");
  const [refLink, setRefLink] = useState(prefill.refLink ?? "");
  const [more, setMore] = useState(() => !!(prefill.note || prefill.steps?.length || prefill.labelIds?.length || prefill.targetOutput || prefill.refLink || (prefill.priority && prefill.priority !== "normal")));

  const applyDuration = (mins: number) => {
    let s = start;
    if (!s) {
      const now = new Date();
      const m = Math.ceil(now.getMinutes() / 15) * 15;
      now.setMinutes(m, 0, 0);
      s = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setStart(s);
    }
    const parts = s.split(":").map(Number);
    const h = parts[0] ?? 0;
    const min = parts[1] ?? 0;
    const total = h * 60 + min + mins;
    const endH = Math.floor(total / 60) % 24;
    const endMin = total % 60;
    setDue(`${String(endH).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`);
  };

  const handleFocusSelect = (type: "deep" | "quick" | "routine" | "urgent") => {
    if (focusType === type) {
      setFocusType(null);
      return;
    }
    setFocusType(type);
    if (type === "deep") {
      setPriority("high");
      applyDuration(120);
    } else if (type === "quick") {
      setPriority("normal");
      applyDuration(30);
    } else if (type === "urgent") {
      setPriority("urgent");
    } else if (type === "routine") {
      setPriority("normal");
    }
  };

  const save = useAction((f: FormData) => {
    const isSelf = mode === "self";
    const finalEmails = isSelf ? [me.email] : [...sel];

    // Combine structured notes for self tasks
    const noteParts: string[] = [];
    if (isSelf && targetOutput.trim()) {
      noteParts.push(`🎯 Target Output: ${targetOutput.trim()}`);
    }
    if (isSelf && refLink.trim()) {
      noteParts.push(`🔗 Referensi: ${refLink.trim()}`);
    }
    const rawNote = String(f.get("note") ?? "").trim();
    if (rawNote) {
      noteParts.push(rawNote);
    }
    const finalNote = noteParts.join("\n\n");

    // Checklist subtasks
    const finalSubtasks = String(f.get("subtasks") ?? "").split("\n").map(s => s.trim()).filter(Boolean);

    return ok(api.tasks.$post({ json: {
      emails: finalEmails,
      title: String(f.get("title")),
      note: finalNote,
      date: routine && !isSelf ? undefined : String(f.get("date") || date),
      start: start || null,
      due: due || null,
      priority,
      projectId: String(f.get("project") || "") || null,
      serviceId: String(f.get("service") || "") || null,
      labelIds: [...lab],
      subtasks: finalSubtasks,
      needProof: isSelf ? proofSelf : proof,
      warnMin: isSelf ? (warnSelf && due ? warnSelf : null) : (due && !routine ? warn : null),
      routineDays: routine && !isSelf ? [...days].sort() : undefined,
    } }));
  }, {
    done: routine && mode === "team" ? "Tugas rutin disimpan" : mode === "self" ? "Tugas mandiri berhasil dibuat" : sel.size > 1 ? `Tugas dibagikan ke ${sel.size} orang` : "Tugas dibuat",
    refresh: [keys.tasks, keys.team, keys.routines, keys.activity]
  });

  const submit = (f: FormData) => {
    if (mode === "team" && !sel.size) return void toast.error("Pilih minimal satu penerima tugas");
    if (!String(f.get("title")).trim()) return void toast.error("Tulis judul tugasnya dulu");
    if (start && due && start >= due) return void toast.error("Jam selesai harus setelah jam mulai");
    if (mode === "team" && routine && !days.size) return void toast.error("Pilih hari untuk tugas rutin");
    save.mutate(f, { onSuccess: onClose });
  };

  const others = people.filter(p => p.email !== me.email);
  const allTeam = others.length > 0 && others.every(p => sel.has(p.email));

  const Presets = () => (
    <div className="chips">
      {PRESETS.map(([lbl, a, b]) => (
        <button key={lbl} type="button" className="chip" aria-pressed={start === a && due === b} onClick={() => { setStart(a); setDue(b); }}>{a ? `${lbl} ${a}–${b}` : lbl}</button>
      ))}
    </div>
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Tugas baru">
        <form style={{ display: "contents" }} onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
          <div className="dialog-h">
            <div>
              <h2>Tugas baru</h2>
              <p className="muted">{mode === "self" ? "Pekerjaan untuk diri sendiri." : "Bagikan ke satu orang atau beberapa anggota tim."}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {manager && (
                <div className="seg" role="group" aria-label="Untuk siapa">
                  <button type="button" aria-pressed={mode === "team"} onClick={() => { setMode("team"); if (sel.size === 1 && sel.has(me.email) && others.length > 0) setSel(new Set([others[0]!.email])); }}><Users size={13} style={{ marginRight: 5 }} />Tim</button>
                  <button type="button" aria-pressed={mode === "self"} onClick={() => { setMode("self"); setSel(new Set([me.email])); }}><CheckSquare size={13} style={{ marginRight: 5 }} />Saya</button>
                </div>
              )}
              <button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button>
            </div>
          </div>

          <div className="dialog-b">
            <section className="dsec">
              {mode === "team" && (
                <div className="field">
                  <span>Untuk siapa {sel.size > 0 && <em style={{ fontStyle: "normal", fontWeight: 400 }}>· {sel.size} dipilih</em>}</span>
                  <div className="chips">
                    <button type="button" className="chip" aria-pressed={allTeam} onClick={() => setSel(sel.size === others.length ? new Set() : new Set(others.map(p => p.email)))}>Semua tim</button>
                    {others.map(m => <button type="button" key={m.email} className="chip" aria-pressed={sel.has(m.email)} onClick={() => setSel(toggle(sel, m.email))}>{m.name}</button>)}
                    <button type="button" className="chip" aria-pressed={sel.has(me.email)} onClick={() => setSel(toggle(sel, me.email))}>+ Saya ikut</button>
                  </div>
                </div>
              )}
              <label className="field">
                <span>Judul tugas</span>
                <input className="input" name="title" autoFocus defaultValue={prefill.title ?? ""} placeholder={mode === "self" ? "Apa yang ingin diselesaikan?" : "mis. Foto produk pashmina warna baru"} maxLength={120} />
              </label>
              {mode === "self" && (
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={focusType === "deep"} onClick={() => handleFocusSelect("deep")}><Zap size={13} />Deep work 2 jam</button>
                  <button type="button" className="chip" aria-pressed={focusType === "quick"} onClick={() => handleFocusSelect("quick")}>Cepat 30 mnt</button>
                  <button type="button" className="chip" aria-pressed={focusType === "urgent"} onClick={() => handleFocusSelect("urgent")}><Flame size={13} />Kritis</button>
                </div>
              )}
            </section>

            <section className="dsec">
              <div className="dgrid">
                {!(routine && mode === "team") && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={prefill.date ?? date} /></label>}
                <div className="timegrid" style={routine && mode === "team" ? { gridColumn: "1 / -1" } : undefined}>
                  <label className="tl"><span>Mulai</span><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                  <label className="tl"><span>Selesai</span><input className="input" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
                </div>
              </div>
              <Presets />
            </section>

            <section className="dsec">
              <div className="dgrid">
                <label className="field"><span>Proyek</span>
                  <select className="input" name="project" value={chosenProject} onChange={e => setChosenProject(e.target.value)}>
                    <option value="">Tanpa proyek</option>
                    {projects.filter(p => !p.archived && !p.closedAt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></label>
                {services.length > 0 && (
                  <label className="field"><span>Layanan</span>
                    <select className="input" name="service" defaultValue={prefill.serviceId ?? ""}>
                      <option value="">Umum</option>
                      {services.map(sv => <option key={sv.id} value={sv.id}>{sv.name}{sv.targetQty ? ` (${sv.targetQty} ${sv.unit})` : ""}</option>)}
                    </select></label>
                )}
              </div>
              {mode === "team" && templates.length > 0 && (
                <div className="chips">
                  <span className="muted" style={{ fontSize: ".76rem" }}>Templat:</span>
                  {templates.map((t, i) => (
                    <span key={i} className="chip" style={{ paddingRight: 4 }}>
                      <button type="button" className="linkbtn" style={{ textDecoration: "none" }} onClick={() => onTemplate({ ...t, emails: [...sel] })}>{t.title}</button>
                      <button type="button" className="iconbtn" style={{ width: 22, height: 22 }} aria-label={`Hapus templat ${t.title}`} onClick={() => { saveTemplates(templates.filter((_, j) => j !== i)); setTpl(n => n + 1); }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="dsec">
              <button type="button" className="linkbtn" aria-expanded={more} onClick={() => setMore(!more)} style={{ justifySelf: "start" }}>{more ? "Sembunyikan opsi lain" : "Opsi lain: prioritas, catatan, checklist, label, pengingat"}</button>
              {more && (
                <>
                  <div className="field"><span>Prioritas</span>
                    <div className="seg" role="group" aria-label="Prioritas" style={{ justifySelf: "start" }}>
                      {PRIORITIES.map(p => <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}
                    </div>
                  </div>
                  <label className="field"><span>Catatan / brief</span><textarea className="input" name="note" rows={2} defaultValue={prefill.note ?? ""} maxLength={600} placeholder="Detail, link brief, atau target" /></label>
                  {mode === "self" && <>
                    <label className="field"><span><Target size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Target hasil akhir</span><input className="input" value={targetOutput} onChange={e => setTargetOutput(e.target.value)} placeholder="mis. Draf artikel 1000 kata selesai" maxLength={180} /></label>
                    <label className="field"><span><Link2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Tautan referensi</span><input className="input" value={refLink} onChange={e => setRefLink(e.target.value)} placeholder="https://…" maxLength={500} /></label>
                  </>}
                  <label className="field"><span><ListChecks size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Checklist <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu langkah per baris)</em></span>
                    <textarea className="input" name="subtasks" rows={3} defaultValue={(prefill.steps ?? []).join("\n")} placeholder={"Ambil foto\nEdit warna\nUnggah ke Drive"} /></label>
                  {labels.length > 0 && (
                    <div className="field"><span>Label</span>
                      <div className="chips">{labels.map(l => <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}><i className="sw" />{l.name}</button>)}</div>
                    </div>
                  )}
                  {due && !(routine && mode === "team") && (
                    <label className="field"><span>Pengingat sebelum jam {due}</span>
                      <select className="input" value={(mode === "self" ? warnSelf : warn) ?? ""} onChange={e => mode === "self" ? setWarnSelf(e.target.value ? Number(e.target.value) : null) : setWarn(Number(e.target.value))}>
                        {mode === "self" && <option value="">Tanpa pengingat</option>}
                        {WARN_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l} sebelumnya</option>)}
                      </select></label>
                  )}
                  <label className="check"><input type="checkbox" checked={mode === "self" ? proofSelf : proof} onChange={e => mode === "self" ? setProofSelf(e.target.checked) : setProof(e.target.checked)} />Wajib lampirkan bukti saat selesai</label>
                  {mode === "team" && (
                    <>
                      <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin setiap minggu</label>
                      {routine && (
                        <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>{DAYN[d]}</button>)}</div>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          </div>
          <footer className="dialog-f">
            <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
            <button type="submit" className="btn primary" disabled={save.isPending}>
              {mode === "self" ? "Simpan tugas" : routine ? "Simpan tugas rutin" : sel.size > 1 ? `Bagikan ke ${sel.size} orang` : "Kirim tugas"}
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

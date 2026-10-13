import { loadTemplates, saveTemplates } from "../lib/templates";
import { useState } from "react";
import { X, Users, Sparkles, Plus, Clock, Target, Link2, ListChecks, Zap, Flame, RefreshCw, Trash2, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { PRIORITIES, type Priority } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { DAYN } from "../lib/format";
import { keys, useAction } from "../lib/queries";
import { PRIORITY_LABEL, WARN_OPTIONS } from "../lib/tasks";
import { useViewer, type NewTaskPrefill } from "../lib/viewer";

const PRESETS: [string, string, string][] = [["Pagi", "08:00", "12:00"], ["Siang", "13:00", "17:00"], ["Sore", "15:00", "17:00"], ["Malam", "19:00", "21:00"], ["Tanpa jam", "", ""]];
const toggle = <T,>(s: Set<T>, v: T) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; };

/** Create a task with support for Team Assignment or Advanced Self Task. */
export function NewTaskDialog({ prefill, date, onClose, onTemplate }: { prefill: NewTaskPrefill; date: string; onClose: () => void; onTemplate: (p: NewTaskPrefill) => void }) {
  const [, setTpl] = useState(0);
  const templates = loadTemplates();
  const { me, team, policy, projects, labels } = useViewer();
  const manager = policy.isManager;
  const people = team.filter(m => m.email === me.email || ((!m.isAdmin || (policy.isBoss && m.email !== policy.me)) && policy.canManage(m.email)));

  // Mode: "team" vs "self"
  const [mode, setMode] = useState<"team" | "self">(() => {
    if (prefill.mode) return prefill.mode;
    if (prefill.emails && prefill.emails.length > 0) {
      if (prefill.emails.length === 1 && prefill.emails[0] === me.email) return "self";
      return "team";
    }
    return manager ? "team" : "self";
  });

  const [sel, setSel] = useState(() => new Set(prefill.emails && prefill.emails.length > 0 ? prefill.emails : [me.email]));
  const [priority, setPriority] = useState<Priority>(prefill.priority ?? "normal");
  const [proof, setProof] = useState(true);
  const [proofSelf, setProofSelf] = useState(false);
  const [warn, setWarn] = useState(30);
  const [warnSelf, setWarnSelf] = useState<number | null>(null);
  const [routine, setRoutine] = useState(false);
  const [days, setDays] = useState(new Set([1, 2, 3, 4, 5, 6]));
  const [lab, setLab] = useState(new Set<string>(prefill.labelIds ?? []));
  const [start, setStart] = useState(prefill.start ?? "");
  const [due, setDue] = useState(prefill.due ?? "");

  // Advanced Self Task States
  const [focusType, setFocusType] = useState<"deep" | "quick" | "routine" | "urgent" | null>(prefill.focusType ?? null);
  const [targetOutput, setTargetOutput] = useState(prefill.targetOutput ?? "");
  const [refLink, setRefLink] = useState(prefill.refLink ?? "");
  const [steps, setSteps] = useState<string[]>(prefill.steps ?? []);
  const [newStepText, setNewStepText] = useState("");
  const [rawTextSteps, setRawTextSteps] = useState(false);

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

  const addStep = () => {
    const s = newStepText.trim();
    if (!s) return;
    setSteps([...steps, s]);
    setNewStepText("");
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const loadStepTemplate = (tpl: string[]) => {
    setSteps(tpl);
    toast.success("Checklist templat diterapkan");
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
    let finalSubtasks: string[] = [];
    if (isSelf && !rawTextSteps) {
      finalSubtasks = steps.map(s => s.trim()).filter(Boolean);
    } else {
      finalSubtasks = String(f.get("subtasks") ?? "").split("\n").map(s => s.trim()).filter(Boolean);
    }

    return ok(api.tasks.$post({ json: {
      emails: finalEmails,
      title: String(f.get("title")),
      note: finalNote,
      date: routine && !isSelf ? undefined : String(f.get("date") || date),
      start: start || null,
      due: due || null,
      priority,
      projectId: String(f.get("project") || "") || null,
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

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Tugas baru">
        <form style={{ display: "contents" }} onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
          <div className="dialog-h">
            <div>
              <h2>{mode === "self" ? "Tugas Diri Sendiri" : "Tugas untuk Tim"}</h2>
              <p className="muted">
                {mode === "self"
                  ? "Mode mandiri (advanced) dengan target capaian, estimasi waktu, checklist & referensi."
                  : "Bagikan pekerjaan ke satu orang atau beberapa anggota tim."}
              </p>
            </div>
            <button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button>
          </div>

          <div className="dialog-b">
            {manager && (
              <div className="modetab-wrap">
                <button
                  type="button"
                  className={"modetab-btn" + (mode === "team" ? " active team" : "")}
                  onClick={() => {
                    setMode("team");
                    if (sel.size === 1 && sel.has(me.email) && others.length > 0) {
                      setSel(new Set([others[0]!.email]));
                    }
                  }}
                >
                  <Users size={16} /> Tugas untuk Tim
                </button>
                <button
                  type="button"
                  className={"modetab-btn" + (mode === "self" ? " active self" : "")}
                  onClick={() => {
                    setMode("self");
                    setSel(new Set([me.email]));
                  }}
                >
                  <Sparkles size={16} /> Tugas Diri Sendiri (Advanced)
                </button>
              </div>
            )}

            {/* MODE: SELF (TUGAS MANDIRI ADVANCED) */}
            {mode === "self" && (
              <>
                <section className="dsec" style={{ borderTop: 0, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(139, 92, 246, 0.08)", borderRadius: 10, border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>
                      {me.name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{me.member?.name ?? me.name} (Anda)</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(139, 92, 246, 0.15)", color: "#7c3aed", fontWeight: 700 }}>Mandiri · Langsung Aktif</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", display: "block", marginBottom: 6 }}>
                      Sifat Tugas &amp; Fokus
                    </span>
                    <div className="chips">
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={focusType === "deep"}
                        onClick={() => handleFocusSelect("deep")}
                        style={focusType === "deep" ? { background: "rgba(139, 92, 246, 0.2)", borderColor: "#7c3aed", color: "#7c3aed" } : {}}
                      >
                        <Zap size={13} /> Deep Work (2 Jam)
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={focusType === "quick"}
                        onClick={() => handleFocusSelect("quick")}
                        style={focusType === "quick" ? { background: "rgba(16, 185, 129, 0.2)", borderColor: "#10b981", color: "#10b981" } : {}}
                      >
                        ⚡ Quick Task (30 Mnt)
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={focusType === "urgent"}
                        onClick={() => handleFocusSelect("urgent")}
                        style={focusType === "urgent" ? { background: "rgba(239, 68, 68, 0.2)", borderColor: "#ef4444", color: "#ef4444" } : {}}
                      >
                        <Flame size={13} /> Prioritas Kritis
                      </button>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={focusType === "routine"}
                        onClick={() => handleFocusSelect("routine")}
                        style={focusType === "routine" ? { background: "rgba(59, 130, 246, 0.2)", borderColor: "#3b82f6", color: "#3b82f6" } : {}}
                      >
                        <RefreshCw size={13} /> Rutinitas Harian
                      </button>
                    </div>
                  </div>
                </section>

                <section className="dsec">
                  <h3>Informasi Utama</h3>
                  <label className="field">
                    <span>Judul Tugas</span>
                    <input className="input" name="title" autoFocus defaultValue={prefill.title ?? ""} placeholder="Apa yang ingin Anda kerjakan & selesaikan?" maxLength={120} />
                  </label>

                  <label className="field">
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Target size={14} style={{ color: "#7c3aed" }} />
                      <b>Target Capaian / Output Akhir (Definition of Done)</b>
                    </span>
                    <input
                      className="input"
                      value={targetOutput}
                      onChange={e => setTargetOutput(e.target.value)}
                      placeholder="Contoh: Dokumen SOP v1 final di-approve, atau draf artikel 1000 kata selesai"
                      maxLength={180}
                    />
                  </label>

                  <label className="field">
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Link2 size={14} style={{ color: "#2563eb" }} />
                      <span>Tautan Dokumen / Referensi Kerja <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span>
                    </span>
                    <input
                      className="input"
                      value={refLink}
                      onChange={e => setRefLink(e.target.value)}
                      placeholder="https://docs.google.com/... link Figma, Google Drive, Notion, spreadsheet, dll."
                      maxLength={500}
                    />
                  </label>

                  <div className="dgrid">
                    <div className="field">
                      <span>Prioritas</span>
                      <div className="seg" role="group" aria-label="Prioritas" style={{ justifySelf: "start" }}>
                        {PRIORITIES.map(p => (
                          <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                            {PRIORITY_LABEL[p]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="field">
                      <span>Proyek</span>
                      <select className="input" name="project" defaultValue={prefill.projectId ?? ""}>
                        <option value="">Tanpa proyek</option>
                        {projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                  </div>

                  {labels.length > 0 && (
                    <div className="field">
                      <span>Label</span>
                      <div className="chips">
                        {labels.map(l => (
                          <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}>
                            <i className="sw" />{l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="dsec">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3>Waktu &amp; Smart Time-Blocking</h3>
                    <span className="muted" style={{ fontSize: 11 }}>Durasi Cepat:</span>
                  </div>

                  <div className="dgrid">
                    <label className="field">
                      <span>Tanggal</span>
                      <input className="input" name="date" type="date" defaultValue={prefill.date ?? date} />
                    </label>
                    <div className="timegrid">
                      <label className="tl"><span>Mulai</span><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                      <label className="tl"><span>Selesai</span><input className="input" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
                    </div>
                  </div>

                  <div className="chips" style={{ gap: 6 }}>
                    <button type="button" className="chip" onClick={() => applyDuration(15)}>+15 mnt</button>
                    <button type="button" className="chip" onClick={() => applyDuration(30)}>+30 mnt</button>
                    <button type="button" className="chip" onClick={() => applyDuration(60)}>+1 jam</button>
                    <button type="button" className="chip" onClick={() => applyDuration(120)}>+2 jam</button>
                    <button type="button" className="chip" onClick={() => applyDuration(240)}>+4 jam</button>
                  </div>

                  <div className="chips" style={{ marginTop: 2 }}>
                    {PRESETS.map(([lbl, a, b]) => (
                      <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>
                        {a ? `${lbl} ${a}–${b}` : lbl}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="dsec">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <ListChecks size={14} /> Checklist Langkah Kerja
                    </h3>
                    <button
                      type="button"
                      className="linkbtn"
                      style={{ fontSize: 11 }}
                      onClick={() => setRawTextSteps(!rawTextSteps)}
                    >
                      {rawTextSteps ? "Gunakan Checklist Interaktif" : "Gunakan Teks Multi-baris"}
                    </button>
                  </div>

                  {!rawTextSteps ? (
                    <div>
                      {steps.length > 0 && (
                        <div className="step-list">
                          {steps.map((st, i) => (
                            <div key={i} className="step-item">
                              <span className="step-num">{i + 1}</span>
                              <span className="step-text">{st}</span>
                              <button type="button" className="step-del" onClick={() => removeStep(i)}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="step-input-row">
                        <input
                          className="input"
                          value={newStepText}
                          onChange={e => setNewStepText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }}
                          placeholder="Tambah langkah lalu tekan Enter…"
                          maxLength={160}
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn small" onClick={addStep}>
                          <Plus size={14} /> Tambah
                        </button>
                      </div>

                      <div className="chips" style={{ marginTop: 8, gap: 6 }}>
                        <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>Templat:</span>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => loadStepTemplate(["1. Riset & Persiapan", "2. Eksekusi Utama", "3. Review & Finishing"])}
                        >
                          ⚡ 3-Tahap
                        </button>
                        <button
                          type="button"
                          className="chip"
                          onClick={() => loadStepTemplate(["1. Draf Awal", "2. Self-Check & Testing", "3. Finalisasi & Simpan"])}
                        >
                          📋 Draf &amp; Review
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="field">
                      <span>Langkah <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu per baris)</em></span>
                      <textarea
                        className="input"
                        name="subtasks"
                        rows={3}
                        defaultValue={(prefill.steps ?? []).join("\n")}
                        placeholder={"1. Siapkan referensi\n2. Kerjakan bagian inti\n3. Cek hasil akhir"}
                      />
                    </label>
                  )}
                </section>

                <section className="dsec">
                  <h3>Catatan Tambahan &amp; Pengaturan</h3>
                  <label className="field">
                    <span>Catatan Tambahan <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span>
                    <textarea className="input" name="note" rows={2} defaultValue={prefill.note ?? ""} maxLength={600} placeholder="Detail, catatan pengingat, atau konteks tambahan" />
                  </label>

                  {due && (
                    <label className="field">
                      <span>Pengingat Mandiri Sebelum Jam {due}</span>
                      <select className="input" value={warnSelf ?? ""} onChange={e => setWarnSelf(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Tanpa pengingat</option>
                        {WARN_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l} sebelumnya</option>)}
                      </select>
                    </label>
                  )}

                  <div style={{ marginTop: 4 }}>
                    <label className="check" style={{ fontSize: ".85rem" }}>
                      <input type="checkbox" checked={proofSelf} onChange={e => setProofSelf(e.target.checked)} />
                      Wajib lampirkan bukti (foto/link/catatan) saat selesai
                    </label>
                    <p className="muted" style={{ fontSize: ".76rem", margin: "2px 0 0 24px" }}>
                      Jika tidak dicentang, tugas mandiri dapat langsung diselesaikan instan sekali klik.
                    </p>
                  </div>
                </section>
              </>
            )}

            {/* MODE: TEAM (TUGAS UNTUK ANGGOTA TIM) */}
            {mode === "team" && (
              <>
                <section className="dsec" style={{ borderTop: 0, paddingTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>Penerima Tugas</h3>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {sel.size > 0 ? `${sel.size} orang dipilih` : "Pilih penerima"}
                    </span>
                  </div>

                  <div className="chips">
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={allTeam}
                      onClick={() => {
                        setSel(sel.size === others.length ? new Set() : new Set(others.map(p => p.email)));
                      }}
                    >
                      Semua Tim
                    </button>
                    {others.map(m => (
                      <button
                        type="button"
                        key={m.email}
                        className="chip"
                        aria-pressed={sel.has(m.email)}
                        onClick={() => setSel(toggle(sel, m.email))}
                      >
                        {m.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={sel.has(me.email)}
                      onClick={() => setSel(toggle(sel, me.email))}
                    >
                      + {me.member?.name ?? "Saya"} (Ikut)
                    </button>
                  </div>
                </section>

                {templates.length > 0 && (
                  <section className="dsec">
                    <h3>Templat</h3>
                    <div className="chips">
                      {templates.map((t, i) => (
                        <span key={i} className="chip" style={{ paddingRight: 4 }}>
                          <button type="button" className="linkbtn" style={{ textDecoration: "none" }} onClick={() => onTemplate({ ...t, emails: [...sel] })}>
                            {t.title}
                          </button>
                          <button type="button" className="iconbtn" style={{ width: 22, height: 22 }} aria-label={`Hapus templat ${t.title}`} onClick={() => { saveTemplates(templates.filter((_, j) => j !== i)); setTpl(n => n + 1); }}>
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                <section className="dsec">
                  <h3>Detail Pekerjaan</h3>
                  <label className="field">
                    <span>Judul Tugas</span>
                    <input className="input" name="title" autoFocus defaultValue={prefill.title ?? ""} placeholder="Contoh: Foto produk pashmina warna baru" maxLength={120} />
                  </label>
                  <label className="field">
                    <span>Deskripsi / Brief Instruksi <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span>
                    <textarea className="input" name="note" rows={2} defaultValue={prefill.note ?? ""} maxLength={600} placeholder="Detail, link brief, atau target" />
                  </label>
                  <div className="dgrid">
                    <div className="field">
                      <span>Prioritas</span>
                      <div className="seg" role="group" aria-label="Prioritas" style={{ justifySelf: "start" }}>
                        {PRIORITIES.map(p => <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}
                      </div>
                    </div>
                    <label className="field">
                      <span>Proyek</span>
                      <select className="input" name="project" defaultValue={prefill.projectId ?? ""}>
                        <option value="">Tanpa proyek</option>
                        {projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {labels.length > 0 && (
                    <div className="field">
                      <span>Label</span>
                      <div className="chips">
                        {labels.map(l => (
                          <button type="button" key={l.id} className="chip" data-c={l.color} aria-pressed={lab.has(l.id)} onClick={() => setLab(toggle(lab, l.id))}>
                            <i className="sw" />{l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="dsec">
                  <h3>Jadwal</h3>
                  <div className="dgrid">
                    {!routine && <label className="field"><span>Tanggal</span><input className="input" name="date" type="date" defaultValue={prefill.date ?? date} /></label>}
                    <div className="timegrid" style={routine ? { gridColumn: "1 / -1" } : undefined}>
                      <label className="tl"><span>Mulai</span><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                      <label className="tl"><span>Selesai</span><input className="input" type="time" value={due} onChange={e => setDue(e.target.value)} /></label>
                    </div>
                  </div>
                  <div className="chips">
                    {PRESETS.map(([lbl, a, b]) => (
                      <button key={lbl} type="button" className="chip" onClick={() => { setStart(a); setDue(b); }}>
                        {a ? `${lbl} ${a}–${b}` : lbl}
                      </button>
                    ))}
                  </div>
                  <div className="chips" style={{ gap: 18, marginTop: 4 }}>
                    <label className="check"><input type="checkbox" checked={routine} onChange={e => setRoutine(e.target.checked)} />Ulangi rutin</label>
                  </div>
                  {routine && (
                    <div className="field">
                      <span>Muncul otomatis setiap</span>
                      <div className="chips">
                        {[1, 2, 3, 4, 5, 6, 0].map(d => (
                          <button type="button" key={d} className="chip" aria-pressed={days.has(d)} onClick={() => setDays(toggle(days, d))}>
                            {DAYN[d]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {due && !routine && (
                  <section className="dsec">
                    <h3>Peringatan tenggat</h3>
                    <label className="field">
                      <span>Ingatkan penerima sebelum jam {due}</span>
                      <select className="input" value={warn} onChange={e => setWarn(Number(e.target.value))}>
                        {WARN_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l} sebelumnya</option>)}
                      </select>
                    </label>
                    <p className="muted" style={{ fontSize: ".8rem" }}>Pengingat dikirim ke notifikasi dan lonceng penerima tugas.</p>
                  </section>
                )}

                {!routine && (
                  <section className="dsec">
                    <h3>Checklist &amp; bukti</h3>
                    <label className="field">
                      <span>Langkah untuk anggota <em style={{ fontStyle: "normal", fontWeight: 400 }}>(satu per baris)</em></span>
                      <textarea className="input" name="subtasks" rows={3} defaultValue={(prefill.steps ?? []).join("\n")} placeholder={"Ambil foto\nEdit warna\nUpload ke Drive"} />
                    </label>
                    <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label>
                  </section>
                )}

                {routine && (
                  <section className="dsec">
                    <h3>Bukti</h3>
                    <label className="check"><input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />Karyawan wajib melampirkan bukti</label>
                  </section>
                )}
              </>
            )}
          </div>

          <footer className="dialog-f">
            <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
            <button type="submit" className="btn primary" disabled={save.isPending}>
              {mode === "self"
                ? "Simpan tugas mandiri"
                : routine
                  ? "Simpan tugas rutin"
                  : sel.size > 1
                    ? `Bagikan ke ${sel.size} orang`
                    : "Kirim tugas"}
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

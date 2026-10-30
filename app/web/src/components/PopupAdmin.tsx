import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { PopupBlock, PopupDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { shrink } from "../lib/image";
import { keys, useAction, usePopups } from "../lib/queries";
import { ConfirmButton, Empty } from "./ui";
import { PopupDialog, fmtUntil } from "./Popup";

const KINDS: { type: PopupBlock["type"]; label: string; blank: PopupBlock }[] = [
  { type: "heading", label: "Judul", blank: { type: "heading", text: "" } },
  { type: "text", label: "Teks", blank: { type: "text", text: "" } },
  { type: "list", label: "Daftar poin", blank: { type: "list", style: "bullet", items: [""] } },
  { type: "list", label: "Daftar bernomor", blank: { type: "list", style: "number", items: [""] } },
  { type: "list", label: "Daftar centang", blank: { type: "list", style: "check", items: [""] } },
  { type: "quote", label: "Kutipan", blank: { type: "quote", text: "", by: "" } },
  { type: "accordion", label: "Lipat (tanya-jawab)", blank: { type: "accordion", title: "", text: "" } },
  { type: "divider", label: "Garis pemisah", blank: { type: "divider" } },
  { type: "callout", label: "Sorotan", blank: { type: "callout", tone: "info", text: "" } },
  { type: "image", label: "Foto", blank: { type: "image", src: "", caption: "" } },
  { type: "video", label: "Video", blank: { type: "video", url: "" } },
  { type: "button", label: "Tombol tautan", blank: { type: "button", label: "", url: "" } },
];
const LABEL: Record<string, string> = { heading: "Judul", text: "Teks", list: "Daftar", callout: "Sorotan", image: "Foto", video: "Video", button: "Tombol tautan", quote: "Kutipan", accordion: "Lipat (tanya-jawab)", divider: "Garis pemisah" };
const DURATIONS: [number | "custom" | null, string][] = [[null, "Tanpa batas waktu"], [60, "1 jam"], [360, "6 jam"], [1440, "1 hari"], [4320, "3 hari"], [10080, "7 hari"], [20160, "14 hari"], [43200, "30 hari"], ["custom", "Sampai tanggal tertentu…"]];
const toLocalInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
const body = (p: PopupDTO, over: Partial<PopupDTO>) => ({ title: p.title, blocks: p.blocks, active: p.active, draft: p.draft, durationMin: p.durationMin, endsAt: p.endsAt, ...over });
const LIST_STYLE = { bullet: "poin", number: "bernomor", check: "centang" } as const;

/** Superadmin tab: compose, preview, switch on/off and delete info popups. */
export function PopupAdmin() {
  const q = usePopups("all");
  const [edit, setEdit] = useState<PopupDTO | "new" | null>(null);
  const [view, setView] = useState<PopupDTO | null>(null);
  const toggle = useAction((p: PopupDTO) => ok(api.popups[":id"].$put({ param: { id: p.id }, json: body(p, { active: !p.active }) })), { refresh: [keys.popups] });
  const publish = useAction((p: PopupDTO) => ok(api.popups[":id"].$put({ param: { id: p.id }, json: body(p, { draft: false, active: true }) })), { done: "Popup diterbitkan", refresh: [keys.popups] });
  const del = useAction((id: string) => ok(api.popups[":id"].$delete({ param: { id } })), { done: "Popup dihapus", refresh: [keys.popups] });
  const list = q.data ?? [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p className="muted">Popup aktif muncul sekali ke setiap anggota (termasuk client) saat membuka aplikasi, sampai ia menekan "Mengerti".</p>
        <button className="btn" onClick={() => setEdit("new")}><Plus size={15} /> Buat popup</button>
      </div>
      {!list.length && !q.isPending && <Empty art="tasks" title="Belum ada popup">Buat popup pertama untuk pengumuman, panduan video, atau tautan penting.</Empty>}
      {list.map(p => (
        <div key={p.id} className="surface" style={{ padding: "12px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <b style={{ overflowWrap: "anywhere" }}>{p.title}</b>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>{[...new Set(p.blocks.map(b => b.type === "list" ? "list" : b.type))].map(t => <span key={t} className="tag due" style={{ fontSize: ".7rem" }}>{LABEL[t]}</span>)}</div>
            <div className="muted" style={{ fontSize: ".8rem" }}>{p.blocks.length} elemen · {new Date(p.createdAt).toLocaleDateString("id-ID")}</div>
          </div>
          {(() => { const gone = !p.draft && p.active && !!p.endsAt && p.endsAt <= Date.now(); return <span className={"tag " + (p.draft ? "warn" : gone ? "off" : p.active ? "ok" : "off")}>{p.draft ? "Draf" : gone ? "Kedaluwarsa" : p.active ? "Aktif" : "Nonaktif"}</span>; })()}
          {!p.draft && p.endsAt && <small className="muted">sampai {fmtUntil(p.endsAt)}</small>}
          {p.draft && p.durationMin && <small className="muted">durasi {DURATIONS.find(d => d[0] === p.durationMin)?.[1] ?? p.durationMin + " mnt"}</small>}
          <button className="iconbtn" aria-label={"Pratinjau " + p.title} onClick={() => setView(p)}><Eye size={15} /></button>
          {p.draft ? <button className="btn small" disabled={publish.isPending} onClick={() => publish.mutate(p)}>Terbitkan</button> : <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={p.active} disabled={toggle.isPending} onChange={() => toggle.mutate(p)} /> Aktif</label>}
          <button className="iconbtn" aria-label={"Ubah " + p.title} onClick={() => setEdit(p)}><Pencil size={15} /></button>
          <ConfirmButton className="iconbtn" ariaLabel={"Hapus " + p.title} label={<Trash2 size={15} />} armed="Hapus?" onConfirm={() => del.mutate(p.id)} />
        </div>
      ))}
      {view && <PopupDialog popup={view} onClose={() => setView(null)} closeLabel="Tutup pratinjau" />}
      {edit && <PopupEditor key={edit === "new" ? "new" : edit.id} popup={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PopupEditor({ popup, onClose }: { popup: PopupDTO | null; onClose: () => void }) {
  const [title, setTitle] = useState(popup?.title ?? "");
  const [blocks, setBlocks] = useState<PopupBlock[]>(popup?.blocks ?? []);
  const [dur, setDur] = useState<number | "custom" | null>(popup ? (popup.durationMin ?? (popup.endsAt ? "custom" : null)) : null);
  const [until, setUntil] = useState(popup?.endsAt ? toLocalInput(popup.endsAt) : "");
  const [preview, setPreview] = useState(false);
  const save = useAction(async (draft: boolean) => {
    const endsAt = dur === "custom" && until ? new Date(until).getTime() : null;
    if (dur === "custom" && !until) throw new Error("Pilih tanggal dan jam berakhir");
    const json = { title, blocks, active: popup && !popup.draft ? popup.active : true, draft, durationMin: typeof dur === "number" ? dur : null, endsAt };
    if (popup) await ok(api.popups[":id"].$put({ param: { id: popup.id }, json }));
    else await ok(api.popups.$post({ json }));
  }, { done: draft => draft ? "Draf disimpan" : "Popup diterbitkan", refresh: [keys.popups] });
  const set = (i: number, b: PopupBlock) => setBlocks(a => a.map((x, j) => j === i ? b : x));
  const move = (i: number, d: number) => setBlocks(a => { const n = [...a], [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });
  const pickImage = async (i: number, b: Extract<PopupBlock, { type: "image" }>, f?: File) => {
    if (!f) return;
    try {
      const blob = await shrink(f, 1000, 0.78);
      const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
      set(i, { ...b, src });
    } catch { toast.error("Foto tidak bisa dibaca"); }
  };
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Editor popup" style={{ width: "min(680px, calc(100vw - 24px))" }}>
        <div className="dialog-h"><h2>{popup ? "Ubah popup" : "Popup baru"}</h2></div>
        <form className="dialog-b" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); save.mutate((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "draft", { onSuccess: onClose }); }} id="popup-form">
          <label className="field"><span>Judul</span><input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required /></label>
          {blocks.map((b, i) => (
            <fieldset key={i} style={{ border: "1px solid var(--line-2)", borderRadius: "var(--radius)", padding: 10, display: "grid", gap: 8, minWidth: 0 }}>
              <legend style={{ fontSize: ".78rem", fontWeight: 600, padding: "0 6px" }}>{LABEL[b.type]}{b.type === "list" ? " · " + LIST_STYLE[b.style ?? "bullet"] : ""}</legend>
              {b.type === "heading" && <input className="input" aria-label="Judul" value={b.text} maxLength={120} required onChange={e => set(i, { ...b, text: e.target.value })} />}
              {b.type === "text" && <textarea className="input" aria-label="Teks" rows={4} value={b.text} maxLength={2000} required onChange={e => set(i, { ...b, text: e.target.value })} />}
              {b.type === "list" && <select className="input" aria-label="Gaya daftar" value={b.style ?? "bullet"} onChange={e => set(i, { ...b, style: e.target.value as typeof b.style })}>{(Object.keys(LIST_STYLE) as (keyof typeof LIST_STYLE)[]).map(k => <option key={k} value={k}>Daftar {LIST_STYLE[k]}</option>)}</select>}
              {b.type === "list" && <textarea className="input" aria-label="Daftar, satu butir per baris" placeholder="Satu butir per baris" rows={4} value={b.items.join("\n")} onChange={e => set(i, { ...b, items: e.target.value.split("\n").slice(0, 20) })} onBlur={() => set(i, { ...b, items: b.items.map(t => t.trim()).filter(Boolean) })} required />}
              {b.type === "callout" && <>
                <select className="input" aria-label="Jenis sorotan" value={b.tone} onChange={e => set(i, { ...b, tone: e.target.value as typeof b.tone })}><option value="info">Info</option><option value="warn">Peringatan</option><option value="ok">Berhasil / kabar baik</option></select>
                <textarea className="input" aria-label="Isi sorotan" rows={2} value={b.text} maxLength={500} required onChange={e => set(i, { ...b, text: e.target.value })} />
              </>}
              {b.type === "quote" && <>
                <textarea className="input" aria-label="Isi kutipan" rows={3} value={b.text} maxLength={500} required onChange={e => set(i, { ...b, text: e.target.value })} />
                <input className="input" aria-label="Sumber kutipan" placeholder="Sumber (opsional)" value={b.by} maxLength={80} onChange={e => set(i, { ...b, by: e.target.value })} />
              </>}
              {b.type === "accordion" && <>
                <input className="input" aria-label="Judul bagian lipat" placeholder="Pertanyaan / judul" value={b.title} maxLength={120} required onChange={e => set(i, { ...b, title: e.target.value })} />
                <textarea className="input" aria-label="Isi bagian lipat" rows={3} value={b.text} maxLength={2000} required onChange={e => set(i, { ...b, text: e.target.value })} />
              </>}
              {b.type === "divider" && <span className="muted" style={{ fontSize: ".8rem" }}>Garis tipis untuk memisahkan bagian.</span>}
              {b.type === "image" && <>
                <input type="file" accept="image/*" aria-label="Pilih foto" onChange={e => void pickImage(i, b, e.target.files?.[0])} required={!b.src} />
                {b.src && <img src={b.src} alt="" style={{ maxHeight: 140, objectFit: "contain", justifySelf: "start", borderRadius: 8 }} />}
                <input className="input" aria-label="Keterangan foto" placeholder="Keterangan (opsional)" value={b.caption} maxLength={200} onChange={e => set(i, { ...b, caption: e.target.value })} />
              </>}
              {b.type === "video" && <input className="input" type="url" aria-label="Tautan video" placeholder="Tautan YouTube, Vimeo, atau berkas video (https://…)" value={b.url} maxLength={500} required onChange={e => set(i, { ...b, url: e.target.value })} />}
              {b.type === "button" && <>
                <input className="input" aria-label="Teks tombol" placeholder="Teks tombol" value={b.label} maxLength={60} required onChange={e => set(i, { ...b, label: e.target.value })} />
                <input className="input" type="url" aria-label="Alamat tautan" placeholder="https://…" value={b.url} maxLength={500} required onChange={e => set(i, { ...b, url: e.target.value })} />
              </>}
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="iconbtn" aria-label="Naikkan" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="iconbtn" aria-label="Turunkan" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" className="iconbtn" aria-label="Hapus elemen" onClick={() => setBlocks(a => a.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            </fieldset>
          ))}
          <div className="lbl">Tambah elemen · tulis **kata** untuk menebalkan</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {KINDS.map(k => <button key={k.label} type="button" className="btn small ghost" disabled={blocks.length >= 20} onClick={() => setBlocks(a => [...a, structuredClone(k.blank)])}>+ {k.label}</button>)}
          </div>
          <div className="row">
            <label className="field"><span>Durasi aktif (dihitung sejak diterbitkan)</span>
              <select className="input" value={String(dur)} onChange={e => setDur(e.target.value === "null" ? null : e.target.value === "custom" ? "custom" : Number(e.target.value))}>
                {DURATIONS.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
              </select>
            </label>
            {dur === "custom" && <label className="field"><span>Berakhir pada</span><input className="input" type="datetime-local" value={until} min={toLocalInput(Date.now())} onChange={e => setUntil(e.target.value)} required /></label>}
          </div>
          {popup && !popup.draft && popup.endsAt && typeof dur === "number" && dur === popup.durationMin && <p className="muted" style={{ fontSize: ".8rem" }}>Berlaku sampai {fmtUntil(popup.endsAt)}. Mengubah durasi memulai hitungan dari sekarang.</p>}
        </form>
        <div className="dialog-f">
          <button type="button" className="btn ghost" onClick={() => setPreview(true)} disabled={!blocks.length}><Eye size={15} /> Pratinjau</button>
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button className="btn ghost" type="submit" value="draft" form="popup-form" disabled={save.isPending || !blocks.length}>Simpan draf</button>
          <button className="btn" type="submit" value="publish" form="popup-form" disabled={save.isPending || !blocks.length}>{popup && !popup.draft ? "Simpan" : "Terbitkan"}</button>
        </div>
      </div>
      {preview && <PopupDialog above popup={{ title: title || "Pratinjau", blocks, endsAt: dur === "custom" && until ? new Date(until).getTime() : typeof dur === "number" ? Date.now() + dur * 60_000 : null }} onClose={() => setPreview(false)} closeLabel="Tutup pratinjau" />}
    </>
  );
}

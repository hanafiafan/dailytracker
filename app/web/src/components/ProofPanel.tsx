import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { TaskDTO } from "@shared/schemas";
import { upload } from "../lib/api";
import { shrink } from "../lib/image";
import { errorText, keys, useProjectServices } from "../lib/queries";
import { useViewer } from "../lib/viewer";

/** Finish a task: attach a photo and/or link as proof, plus an optional note. */
export function ProofPanel({ t, onClose }: { t: TaskDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const { policy } = useViewer();
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // A task in a project service can report how many deliverables it produced (photos, pages, ...); they add up to the service target.
  const svc = useProjectServices(t.projectId).data?.find(s => s.id === t.serviceId);

  const submit = async (form: HTMLFormElement, skipProof: boolean) => {
    const fd = new FormData(form);
    const link = String(fd.get("link") ?? "").trim();
    const note = String(fd.get("note") ?? "").trim();
    if (!skipProof && !file && !link && !note) return void toast.error("Lampirkan foto/screenshot, link terkait, atau keterangan sebagai bukti");
    setBusy(true);
    try {
      const out = new FormData();
      if (!skipProof) {
        if (file) {
          let blob = await shrink(file.file, 1200, 0.62);
          if (blob.size > 650_000) blob = await shrink(file.file, 800, 0.55);
          out.set("photo", blob, "bukti.jpg");
        }
        if (link) out.set("link", link);
      } else out.set("skipProof", "1");
      if (note) out.set("note", note);
      const qty = String(fd.get("qty") ?? "").trim();
      if (qty) out.set("qty", qty);
      await upload(`/api/tasks/${t.id}/complete`, out);
      toast.success(skipProof ? "Tugas selesai" : "Tugas selesai dengan bukti");
      for (const k of [keys.tasks, keys.activity, keys.analytics]) await qc.invalidateQueries({ queryKey: k });
      onClose();
    } catch (err) { toast.error(errorText(err)); }
    setBusy(false);
  };
  return (
    <form className="proofpanel" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget, false); }}>
      <b>Bukti tugas selesai</b>
      <p className="foot">Lampirkan foto/screenshot, tempel link hasil kerja (Drive, Figma, medsos), atau tulis keterangan hasil kerja.</p>
      {file
        ? <div className="pv"><img src={file.preview} alt="Pratinjau bukti" /><button type="button" className="linkbtn" onClick={() => { URL.revokeObjectURL(file.preview); setFile(null); }}>Ganti foto</button></div>
        : <label className="drop"><input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ file: f, preview: URL.createObjectURL(f) }); }} /><span className="iconline"><Camera size={18} />Pilih foto / screenshot</span></label>}
      <input className="input" name="link" type="url" inputMode="url" placeholder="atau tempel link hasil kerja" maxLength={500} aria-label="Link bukti" />
      {t.serviceId && <label className="field"><span>Jumlah hasil{svc?.unit ? ` (${svc.unit})` : ""}{svc?.targetQty ? ` — target ${svc.targetQty}` : ""}</span><input className="input" name="qty" type="number" min={0} max={100000} inputMode="numeric" defaultValue={t.qty || ""} placeholder="mis. 25" /></label>}
      <textarea className="input" name="note" rows={2} maxLength={600} placeholder="Keterangan / catatan penyelesaian tugas" aria-label="Keterangan bukti" defaultValue={t.report ?? ""} />
      <div className="actions">
        <button type="button" className="btn small ghost" onClick={onClose}>Batal</button>
        {(!t.needProof || policy.isManager) && <button type="button" className="btn small" disabled={busy} onClick={e => void submit(e.currentTarget.form!, true)}>Selesai tanpa bukti</button>}
        <button type="submit" className="btn small primary" disabled={busy}>{busy ? "Mengunggah…" : "Tandai selesai"}</button>
      </div>
    </form>
  );
}

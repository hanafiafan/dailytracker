import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TaskDTO } from "@shared/schemas";
import { atMs } from "@shared/time";
import { api, ok, upload } from "../lib/api";
import { NEXT, STATUS, dur, fmtShort, fmtTime, host } from "../lib/format";
import { shrink } from "../lib/image";
import { errorText, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { ConfirmButton } from "./ui";

function TimeTags({ t }: { t: TaskDTO }) {
  const now = Date.now();
  const dl = t.due ? atMs(t.date, t.due) : null, st = t.start ? atMs(t.date, t.start) : null;
  return <>
    {(st || dl) && <span className="tag due">⏰ {t.start && t.due ? `${t.start}–${t.due}` : t.start ? "mulai " + t.start : "s/d " + t.due}</span>}
    {t.status === "done" && t.doneAt && dl
      ? (t.doneAt - dl <= 60000 ? <span className="tag on">Tepat waktu</span> : <span className="tag late">Telat {dur(t.doneAt - dl)}</span>)
      : t.status !== "done" && dl && now > dl ? <span className="tag hot">Terlambat {dur(now - dl)}</span>
      : t.status === "todo" && st && now > st ? <span className="tag late">Belum mulai · lewat {dur(now - st)}</span> : null}
    {t.startedAt && <span className="tag off">Mulai {fmtTime(t.startedAt)}</span>}
    {t.status === "done" && t.doneAt && <span className="tag off">Selesai {fmtTime(t.doneAt)}</span>}
  </>;
}

function ProofPanel({ t, onClose }: { t: TaskDTO; onClose: () => void }) {
  const qc = useQueryClient();
  const { policy } = useViewer();
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (form: HTMLFormElement, skipProof: boolean) => {
    const fd = new FormData(form);
    if (!skipProof && !file && !String(fd.get("link") ?? "").trim()) return void toast.error("Lampirkan foto/screenshot atau link sebagai bukti");
    setBusy(true);
    try {
      const out = new FormData();
      if (!skipProof) {
        if (file) {
          let blob = await shrink(file.file, 1200, 0.62);
          if (blob.size > 650_000) blob = await shrink(file.file, 800, 0.55);
          out.set("photo", blob, "bukti.jpg");
        }
        out.set("link", String(fd.get("link") ?? ""));
      } else out.set("skipProof", "1");
      out.set("note", String(fd.get("note") ?? ""));
      await upload(`/api/tasks/${t.id}/complete`, out);
      toast.success(skipProof ? "Tugas selesai" : "Tugas selesai dengan bukti");
      await qc.invalidateQueries({ queryKey: keys.tasks });
      onClose();
    } catch (err) { toast.error(errorText(err)); }
    setBusy(false);
  };
  return (
    <form className="proofpanel" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget, false); }}>
      <b>Bukti tugas selesai</b>
      <p className="foot">Unggah foto atau screenshot hasil kerja, atau tempel link (Drive, Instagram, TikTok, marketplace). Untuk video, pakai link.</p>
      {file
        ? <div className="pv"><img src={file.preview} alt="Pratinjau bukti" /><button type="button" className="linkbtn" onClick={() => { URL.revokeObjectURL(file.preview); setFile(null); }}>Ganti foto</button></div>
        : <label className="drop"><input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setFile({ file: f, preview: URL.createObjectURL(f) }); }} /><span>📷 Pilih foto / screenshot</span></label>}
      <input className="input" name="link" type="url" inputMode="url" placeholder="atau tempel link hasil kerja" maxLength={500} aria-label="Link bukti" />
      <textarea className="input" name="note" rows={2} maxLength={600} placeholder="Catatan singkat (opsional)" aria-label="Catatan" />
      <div className="actions">
        <button type="button" className="btn small ghost" onClick={onClose}>Batal</button>
        {(!t.needProof || policy.isManager) && <button type="button" className="btn small" disabled={busy} onClick={e => void submit(e.currentTarget.form!, true)}>Selesai tanpa bukti</button>}
        <button type="submit" className="btn small primary" disabled={busy}>{busy ? "Mengunggah…" : "Tandai selesai"}</button>
      </div>
    </form>
  );
}

function Comments({ t }: { t: TaskDTO }) {
  const { me, policy } = useViewer();
  const [text, setText] = useState("");
  const add = useAction(async () => { await ok(api.tasks[":id"].comments.$post({ param: { id: t.id }, json: { text } })); setText(""); });
  const del = useAction((cid: string) => ok(api.tasks[":id"].comments[":cid"].$delete({ param: { id: t.id, cid } })));
  return (
    <div className="cmt">
      {t.comments.map(c => (
        <div className="c" key={c.id}>
          <b>{c.by}</b>: {c.text}<small>{fmtTime(c.at)}</small>
          {(c.byEmail === me.email || policy.canManage(t.email)) && <button aria-label="Hapus komentar" onClick={() => del.mutate(c.id)}>✕</button>}
        </div>
      ))}
      <form onSubmit={e => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Tulis komentar…" maxLength={600} aria-label={"Komentar untuk " + t.title} />
        <button className="btn small" type="submit" disabled={add.isPending || !text.trim()}>Kirim</button>
      </form>
    </div>
  );
}


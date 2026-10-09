import { useState } from "react";
import { CalendarOff, Check, ExternalLink, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { host } from "../lib/format";
import { LEAVE_KINDS, type LeaveDTO, type LeaveKind } from "@shared/schemas";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { ApiError, api, ok, putImage } from "../lib/api";
import { shrink } from "../lib/image";
import { fmtShort, today } from "../lib/format";
import { LEAVE_LABEL, LEAVE_STATUS } from "../lib/leaves";
import { keys, useAction, useLeaves } from "../lib/queries";
import { useViewer } from "../lib/viewer";

const range = (l: LeaveDTO) => (l.from === l.to ? fmtShort(l.from) : `${fmtShort(l.from)} – ${fmtShort(l.to)}`);
const days = (l: LeaveDTO) => Math.round((Date.parse(l.to + "T12:00:00Z") - Date.parse(l.from + "T12:00:00Z")) / 86_400_000) + 1;

function Request() {
  const [kind, setKind] = useState<LeaveKind>("cuti");
  const [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [reason, setReason] = useState("");
  const [link, setLink] = useState(""), [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const submit = async () => {
    if (to < from) return;
    const url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) return void toast.error("Tautan bukti harus diawali http:// atau https://");
    setBusy(true);
    try {
      const made = await ok(api.leaves.$post({ json: { kind, from, to, reason, proofLink: url || null } })) as unknown as { id: string };
      if (photo) {
        let blob = await shrink(photo, 1200, 0.62);
        if (blob.size > 650_000) blob = await shrink(photo, 800, 0.55);
        try { await putImage(`/api/leaves/${made.id}/proof`, blob); } catch (e) { toast.error("Pengajuan terkirim, tetapi foto gagal diunggah: " + (e instanceof ApiError ? e.message : "coba lagi")); }
      }
      toast.success("Pengajuan terkirim"); setReason(""); setLink(""); setPhoto(null);
      await Promise.all([keys.leaves, keys.activity].map(k => qc.invalidateQueries({ queryKey: k })));
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Gagal mengirim. Coba lagi."); }
    setBusy(false);
  };
  return (
    <section className="bc">
      <div className="bc-h"><span className="bc-ico"><CalendarOff size={18} /></span><h2>Ajukan izin atau cuti</h2></div>
      <form className="dsec" style={{ border: 0, padding: 0 }} onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="seg" role="group" aria-label="Jenis" style={{ justifySelf: "start" }}>{LEAVE_KINDS.map(k => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{LEAVE_LABEL[k]}</button>)}</div>
        <div className="dgrid">
          <label className="field"><span>Mulai</span><input className="input" type="date" value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} required /></label>
          <label className="field"><span>Sampai</span><input className="input" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} required /></label>
        </div>
        <label className="field"><span>Alasan <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span><textarea className="input" rows={2} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Contoh: acara keluarga" /></label>
        <div className="dgrid">
          <label className="field"><span>Tautan bukti <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span><input className="input" type="url" inputMode="url" maxLength={500} value={link} onChange={e => setLink(e.target.value)} placeholder="https://drive.google.com/…" /></label>
          <div className="field"><span>Foto bukti <em style={{ fontStyle: "normal", fontWeight: 400 }}>(opsional)</em></span>
            <label className="btn" style={{ justifySelf: "start" }}><Paperclip size={14} />{photo ? "Ganti foto" : "Pilih foto"}<input type="file" accept="image/*" hidden onChange={e => setPhoto(e.target.files?.[0] ?? null)} /></label>
            {photo && <span className="muted" style={{ fontSize: ".78rem" }}>{photo.name} <button type="button" className="linkbtn" onClick={() => setPhoto(null)}>hapus</button></span>}</div>
        </div>
        <div className="actions"><button className="btn blue" disabled={busy}>Kirim pengajuan</button></div>
      </form>
    </section>
  );
}

function Row({ l, manage }: { l: LeaveDTO; manage: boolean }) {
  const { member, me, policy } = useViewer();
  const m = member(l.email);
  const [zoom, setZoom] = useState(false);
  const decide = useAction((status: "approved" | "rejected") => ok(api.leaves[":id"].decision.$patch({ param: { id: l.id }, json: { status } })), { refresh: [keys.leaves, keys.inbox], done: s => (s === "approved" ? "Disetujui" : "Ditolak") });
  const del = useAction(() => ok(api.leaves[":id"].$delete({ param: { id: l.id } })), { refresh: [keys.leaves], done: "Dihapus" });
  const canDecide = manage && l.status === "pending" && l.email !== me.email && policy.canManage(l.email);
  const canDel = l.email === me.email ? l.status === "pending" : policy.canManage(l.email);
  return (
    <li className="arow">
      {m ? <Avatar m={m} /> : <span className="avatar">?</span>}
      <div style={{ minWidth: 0 }}><b className="clamp1">{m?.name ?? l.email} · {LEAVE_LABEL[l.kind]} {days(l)} hari</b><small className="muted clamp1">{range(l)}{l.reason ? ` · ${l.reason}` : ""}</small>
        {(l.proofLink || l.hasPhoto) && <span className="chips" style={{ marginTop: 4 }}>
          {l.proofLink && <a className="chip" href={l.proofLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{host(l.proofLink)}</a>}
          {l.hasPhoto && <button type="button" className="chip" onClick={() => setZoom(true)}><ImageIcon size={12} />Foto bukti</button>}</span>}
        {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(false)}><img src={`/api/leaves/${l.id}/proof`} alt="Foto bukti" /></div>}</div>
      <div className="chips" style={{ flexWrap: "nowrap" }}>
        <span className={"stpill " + (l.status === "approved" ? "done" : l.status === "rejected" ? "late" : "")}>{LEAVE_STATUS[l.status]}</span>
        {canDecide && <><button className="iconbtn dark" aria-label="Setujui" disabled={decide.isPending} onClick={() => decide.mutate("approved")}><Check size={15} /></button><button className="iconbtn" aria-label="Tolak" disabled={decide.isPending} onClick={() => decide.mutate("rejected")}><X size={15} /></button></>}
        {canDel && !canDecide && <button className="btn small ghost" onClick={() => del.mutate()}>{l.email === me.email ? "Batalkan" : "Hapus"}</button>}
      </div>
    </li>
  );
}

export function LeavePage() {
  const { policy, me } = useViewer();
  const q = useLeaves(true), all = q.data ?? [];
  const mine = all.filter(l => l.email === me.email), others = all.filter(l => l.email !== me.email);
  const waiting = others.filter(l => l.status === "pending" && policy.canManage(l.email));
  const away = others.filter(l => l.status === "approved" && l.to >= today());
  const [tab, setTab] = useState(me.member ? "saya" : "persetujuan");
  return (
    <Page noNew title="Izin & cuti" sub={policy.isManager ? `${waiting.length} menunggu keputusan` : "Ajukan, lalu atasan memutuskan"}
      tabs={!policy.isManager ? undefined : [...(me.member ? [{ id: "saya", label: "Pengajuan saya" }] : []), ...[{ id: "persetujuan", label: `Persetujuan${waiting.length ? ` (${waiting.length})` : ""}` }, { id: "jadwal", label: "Jadwal tidak masuk" }]]} tab={tab} onTab={setTab}>
      {tab === "saya" && (
        <div className="two2">
          <Request />
          <section className="bc"><div className="bc-h"><h2>Riwayat saya</h2></div>
            <ul className="alist">{mine.map(l => <Row key={l.id} l={l} manage={false} />)}</ul>
            {!mine.length && <Empty art="calendar" title="Belum ada pengajuan" />}
          </section>
        </div>
      )}
      {tab === "persetujuan" && (
        <section className="bc"><div className="bc-h"><h2>Menunggu keputusan</h2><span className="muted">{waiting.length}</span></div>
          <ul className="alist">{waiting.map(l => <Row key={l.id} l={l} manage />)}</ul>
          {!waiting.length && <Empty art="activity" title="Tidak ada pengajuan yang menunggu" />}
        </section>
      )}
      {tab === "jadwal" && (
        <section className="bc"><div className="bc-h"><h2>Sedang dan akan tidak masuk</h2><span className="muted">{away.length}</span></div>
          <ul className="alist">{away.sort((a, b) => a.from.localeCompare(b.from)).map(l => <Row key={l.id} l={l} manage />)}</ul>
          {!away.length && <Empty art="calendar" title="Semua masuk seperti biasa" />}
        </section>
      )}
    </Page>
  );
}

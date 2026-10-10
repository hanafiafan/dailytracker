import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ChannelDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { errorText, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { ConfirmButton } from "./ui";

/** Create a chat group, or (with `ch`) rename it and change who is in it. */
export function GroupDialog({ ch, onClose, onDone }: { ch?: ChannelDTO; onClose: () => void; onDone: (id: string | null) => void }) {
  const { me, team, policy } = useViewer();
  const g = ch?.group;
  const [name, setName] = useState(ch?.name ?? "");
  const [sel, setSel] = useState(new Set((g?.members ?? []).filter(e => e !== me.email)));
  const [q, setQ] = useState("");
  const manage = !g || g.canManage;
  const people = team.filter(m => m.email !== me.email && (!q.trim() || `${m.name} ${m.role} ${m.group}`.toLowerCase().includes(q.trim().toLowerCase())));
  const refresh = [[...keys.chat, "channels"]];
  const save = useAction(async () => {
    const json = { name: name.trim(), emails: [...sel] };
    if (ch) { await ok(api.chat.groups[":id"].$patch({ param: { id: ch.id.slice(2) }, json })); return null; }
    return (await ok(api.chat.groups.$post({ json }))).id;
  }, { done: ch ? "Grup disimpan" : "Grup dibuat", refresh });
  const leave = useAction(() => ok(api.chat.groups[":id"].leave.$post({ param: { id: ch!.id.slice(2) } })), { done: "Kamu keluar dari grup", refresh });
  const del = useAction(() => ok(api.chat.groups[":id"].$delete({ param: { id: ch!.id.slice(2) } })), { done: "Grup dihapus", refresh });
  const toggle = (e: string) => setSel(s => { const n = new Set(s); if (n.has(e)) n.delete(e); else n.add(e); return n; });
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label={ch ? "Pengaturan grup" : "Grup baru"}>
        <form style={{ display: "contents" }} onSubmit={e => {
          e.preventDefault();
          if (!name.trim()) return void toast.error("Beri nama grup dulu");
          if (!ch && !sel.size) return void toast.error("Pilih minimal satu anggota");
          save.mutate(undefined, { onSuccess: id => { onDone(id ? String(id) : null); onClose(); }, onError: e2 => toast.error(errorText(e2)) });
        }}>
          <div className="dialog-h"><div><h2>{ch ? "Pengaturan grup" : "Grup baru"}</h2><p className="muted">{manage ? "Hanya anggota yang bisa membaca dan menulis di grup." : `Dibuat oleh ${g!.createdBy}`}</p></div><button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button></div>
          <div className="dialog-b"><section className="dsec">
            <label className="field"><span>Nama grup</span><input className="input" value={name} maxLength={40} disabled={!manage} onChange={e => setName(e.target.value)} placeholder="Contoh: Tim Konten" autoFocus /></label>
            <div className="field"><span>Anggota ({sel.size + 1} termasuk kamu)</span>
              {manage && <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, jabatan, atau unit" aria-label="Cari anggota" />}
              <div className="chips" style={{ maxHeight: 220, overflow: "auto" }}>
                {(manage ? people : team.filter(m => g!.members.includes(m.email))).map(m => <button type="button" key={m.email} className="chip" aria-pressed={sel.has(m.email) || (!manage)} disabled={!manage} onClick={() => toggle(m.email)}>{m.name}{m.group ? ` · ${m.group}` : ""}</button>)}
              </div>
              {manage && <div className="chips"><button type="button" className="btn small ghost" onClick={() => setSel(new Set(team.filter(m => m.email !== me.email).map(m => m.email)))}>Pilih semua</button><button type="button" className="btn small ghost" onClick={() => setSel(new Set())}>Kosongkan</button></div>}
            </div>
          </section></div>
          <footer className="dialog-f">
            {ch && manage && <ConfirmButton className="btn danger" label="Hapus grup" armed="Yakin hapus semua pesan?" onConfirm={() => del.mutate(undefined, { onSuccess: () => { onDone(null); onClose(); } })} />}
            {ch && g && g.createdBy !== me.email && !policy.isOwner && <button type="button" className="btn ghost" onClick={() => leave.mutate(undefined, { onSuccess: () => { onDone(null); onClose(); } })}>Keluar dari grup</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn ghost" onClick={onClose}>Tutup</button>
            {manage && <button className="btn primary" disabled={save.isPending}>{ch ? "Simpan" : "Buat grup"}</button>}
          </footer>
        </form>
      </div>
    </>
  );
}

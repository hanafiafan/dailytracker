import { useEffect, useState } from "react";
import { Download, History, Plus, Trash2, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { BackupDTO, BackupSettings } from "@shared/schemas";
import { api, ok, upload } from "../lib/api";
import { keys, useAction } from "../lib/queries";
import { ConfirmButton } from "./ui";

type Data = { settings: BackupSettings; files: BackupDTO[] };
type Plan = { remove: { label: string; n: number }[]; keep: { label: string; n: number }[]; admins: number };
const KIND = { auto: "Terjadwal", manual: "Manual", "pre-reset": "Sebelum reset" } as const;
const mb = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";
const when = (ms: number) => new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB";

/** Superadmin tab: backup sessions (times of day), manual copies, and the data reset (always preceded by a copy that is never pruned). */
export function BackupAdmin() {
  const q = useQuery({ queryKey: [...keys.admin, "backups"], queryFn: () => ok(api.admin.backups.$get()) as unknown as Promise<Data> });
  const refresh = [[...keys.admin, "backups"]];
  const [s, setS] = useState<BackupSettings | null>(null);
  useEffect(() => { if (q.data) setS(q.data.settings); }, [q.data]);
  const [label, setLabel] = useState("");
  const [opt, setOpt] = useState({ chat: false, leaves: false, acks: false });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirm, setConfirm] = useState("");

  const save = useAction((v: BackupSettings) => ok(api.admin.backups.settings.$put({ json: v })), { done: "Jadwal backup disimpan", refresh });
  const now = useAction(() => ok(api.admin.backups.$post({ json: { label } })).then(() => setLabel("")), { done: "Backup dibuat", refresh });
  const del = useAction((file: string) => ok(api.admin.backups[":file"].$delete({ param: { file } })), { done: "Backup dihapus", refresh });
  const send = useAction((f: File) => { const fd = new FormData(); fd.set("file", f); return upload("/api/admin/backups/upload", fd); }, { done: "Backup diunggah", refresh });
  const restore = useAction(async (file: string) => {
    await ok(api.admin.backups[":file"].restore.$post({ param: { file }, json: { confirm: "PULIHKAN" } }));
    setTimeout(() => location.reload(), 4000);
  }, { done: "Data dipulihkan. Aplikasi restart, halaman dimuat ulang sebentar lagi.", refresh: [] });
  const look = useAction(async () => setPlan(await ok(api.admin.reset.plan.$post({ json: opt })) as unknown as Plan), {});
  const reset = useAction(async () => { await ok(api.admin.reset.$post({ json: { ...opt, confirm: "RESET" } })); setPlan(null); setConfirm(""); }, { done: "Data direset. Salinan sebelum reset tersimpan di daftar backup.", refresh: [...refresh, keys.tasks, keys.team, keys.admin] });

  if (!s) return null;
  const times = s.times, set = (p: Partial<BackupSettings>) => setS({ ...s, ...p });
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="surface" style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Sesi backup otomatis</h2>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} /> Aktifkan backup terjadwal</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {times.map((t, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input className="input" type="time" aria-label={`Jam sesi ${i + 1}`} value={t} onChange={e => set({ times: times.map((x, j) => j === i ? e.target.value : x) })} style={{ width: 120 }} />
              {times.length > 1 && <button type="button" className="iconbtn" aria-label="Hapus sesi" onClick={() => set({ times: times.filter((_, j) => j !== i) })}><X size={14} /></button>}
            </span>
          ))}
          {times.length < 12 && <button type="button" className="btn small" onClick={() => set({ times: [...times, "12:00"] })}><Plus size={14} /> Tambah sesi</button>}
        </div>
        <label className="field" style={{ maxWidth: 260 }}><span>Simpan salinan terjadwal terbaru</span><input className="input" type="number" min={1} max={90} value={s.keep} onChange={e => set({ keep: Math.min(90, Math.max(1, Number(e.target.value) || 1)) })} /></label>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Jam dalam WIB. Salinan yang lebih lama dari batas itu dihapus otomatis; backup manual dan sebelum-reset tidak pernah dihapus otomatis.</p>
        <div><button className="btn" disabled={save.isPending} onClick={() => save.mutate(s)}>Simpan jadwal</button></div>
      </section>

      <section className="surface" style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Daftar backup ({q.data?.files.length ?? 0})</h2>
          <span style={{ display: "inline-flex", gap: 8 }}>
            <input className="input" placeholder="Catatan (opsional)" aria-label="Catatan backup" maxLength={40} value={label} onChange={e => setLabel(e.target.value)} />
            <button className="btn" disabled={now.isPending} onClick={() => now.mutate()}>Backup sekarang</button>
            <label className="btn" style={{ cursor: "pointer" }}><Upload size={15} /> Unggah backup<input type="file" accept=".db,application/octet-stream" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send.mutate(f); }} /></label>
          </span>
        </div>
        {q.data?.files.map(f => (
          <div key={f.file} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span style={{ flex: "1 1 260px", minWidth: 0, overflowWrap: "anywhere" }}><b>{KIND[f.kind]}</b> · {f.file}</span>
            <span className="muted">{when(f.at)} · {mb(f.size)}</span>
            <a className="iconbtn" aria-label={`Unduh ${f.file}`} title="Unduh" href={`/api/admin/backups/${encodeURIComponent(f.file)}/download`} download><Download size={15} /></a>
            <ConfirmButton className="btn small" ariaLabel={`Pulihkan ${f.file}`} label={<><History size={14} /> Pulihkan</>} armed="Timpa semua data?" onConfirm={() => restore.mutate(f.file)} />
            <ConfirmButton className="iconbtn" ariaLabel={`Hapus ${f.file}`} label={<Trash2 size={15} />} armed="Yakin?" onConfirm={() => del.mutate(f.file)} />
          </div>
        ))}
        {!q.data?.files.length && <p className="muted">Belum ada backup.</p>}
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Unduh/unggah untuk memindahkan backup ke luar server. "Pulihkan" menimpa seluruh data dengan salinan itu lalu me-restart aplikasi; data saat ini disimpan dulu sebagai "Sebelum reset".</p>
      </section>

      <section className="surface" style={{ padding: "16px 20px", display: "grid", gap: 12, borderColor: "var(--danger, #c0392b)" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Reset data</h2>
        <p className="muted" style={{ margin: 0 }}>Menghapus tugas, proyek, booking, riwayat, dan notifikasi. Anggota, entitas, dan pengaturan tetap. Satu backup "Sebelum reset" dibuat otomatis dan tidak ikut terhapus.</p>
        {([["chat", "Hapus juga semua chat dan grup chat"], ["leaves", "Hapus juga izin dan cuti"], ["acks", "Hapus juga konfirmasi panduan"]] as const).map(([k, l]) => (
          <label key={k} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={opt[k]} onChange={e => { setOpt({ ...opt, [k]: e.target.checked }); setPlan(null); }} /> {l}</label>
        ))}
        <div><button className="btn" disabled={look.isPending} onClick={() => look.mutate()}>Lihat dampak</button></div>
        {plan && (
          <div style={{ display: "grid", gap: 10 }}>
            <div><b>Akan dihapus</b>{plan.remove.map(r => <div key={r.label}>{r.n} · {r.label}</div>)}</div>
            <div><b>Tetap ada</b>{plan.keep.map(r => <div key={r.label}>{r.n} · {r.label}</div>)}</div>
            <label className="field" style={{ maxWidth: 320 }}><span>Ketik RESET untuk melanjutkan</span><input className="input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></label>
            <div><button className="btn danger" disabled={confirm !== "RESET" || reset.isPending} onClick={() => reset.mutate()}>Reset data sekarang</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

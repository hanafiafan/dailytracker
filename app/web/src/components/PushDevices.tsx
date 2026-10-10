import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ok } from "../lib/api";
import { localTest, pushSupported } from "../lib/push";
import { errorText } from "../lib/queries";

const KEY = ["push-devices"] as const;
const label = (host: string) => host.includes("apple") ? "iPhone / Safari" : host.includes("googleapis") ? "Android / Chrome" : host.includes("mozilla") ? "Firefox" : host.includes("windows") ? "Edge / Windows" : host;
const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);

/** Devices that get my push notifications, a way to remove one, and a test message to see that delivery really works. */
export function PushDevices() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => ok(api.push.devices.$get()) as unknown as Promise<{ id: string; service: string }[]> });
  const [here, setHere] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pushSupported()) return;
    void navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(s => s ? hex(s.endpoint) : null).then(setHere).catch(() => setHere(null));
  }, [q.data]);
  const list = q.data ?? [];
  const test = async () => {
    setBusy(true);
    try {
      const r = await ok(api.push.test.$post()) as unknown as { sent: number; failed: number };
      if (!list.length) toast.error("Belum ada perangkat terdaftar. Aktifkan notifikasi dulu.");
      else if (r.sent) toast.success(`Terkirim ke ${r.sent} perangkat. Cek layar atau bar notifikasi HP.`);
      else toast.error("Gagal terkirim. Hapus perangkat lama lalu aktifkan ulang.");
      void qc.invalidateQueries({ queryKey: KEY });
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  const remove = async (id: string) => { await ok(api.push.devices[":id"].$delete({ param: { id } })); void qc.invalidateQueries({ queryKey: KEY }); };
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <div className="actions" style={{ justifyContent: "flex-start" }}><button className="btn" onClick={test} disabled={busy}><BellRing size={14} />Kirim notifikasi uji</button><span className="muted" style={{ fontSize: ".8rem" }}>{list.length} perangkat terdaftar</span></div>
      {list.length > 0 && <ul className="alist">{list.map(d => (
        <li key={d.id} className="arow" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}>
          <span className="bc-ico"><Smartphone size={16} /></span>
          <div><b className="clamp1">{label(d.service)}</b><small className="muted">{d.id === here ? "Perangkat ini" : "Perangkat lain"}</small></div>
          <button className="iconbtn" aria-label="Hapus perangkat" onClick={() => remove(d.id)}><Trash2 size={13} /></button>
        </li>))}</ul>}
      <div className="actions" style={{ justifyContent: "flex-start" }}><button className="btn small" onClick={() => localTest().then(() => toast.message("Tes dikirim. Kalau tidak ada yang muncul, lihat panduan di bawah.")).catch(e => toast.error(errorText(e)))}>Tes tampil di perangkat ini</button></div>
      {/Mac/i.test(navigator.platform) && <details className="muted" style={{ fontSize: ".82rem" }}><summary>Notifikasi tidak muncul di Mac?</summary><ol style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 3 }}>
        <li>Buka Pengaturan Sistem, Notifikasi, lalu pilih browsermu (Chrome, Safari, atau Edge) dan nyalakan Izinkan Notifikasi.</li>
        <li>Matikan mode Fokus atau Jangan Ganggu di Pusat Kontrol.</li>
        <li>Di Chrome: alamat situs, ikon gembok, lalu pastikan Notifikasi diset Izinkan.</li>
        <li>Kalau "Tes tampil di perangkat ini" juga tidak muncul, penyebabnya ada di pengaturan Mac. Kalau muncul tapi notifikasi uji dari server tidak, hapus perangkat ini di atas lalu aktifkan ulang notifikasi.</li>
      </ol></details>}
      {!list.length && <p className="muted" style={{ fontSize: ".8rem" }}>Belum ada perangkat. Tekan "Aktifkan notifikasi" di perangkat yang ingin dipakai (satu per satu).</p>}
    </div>
  );
}

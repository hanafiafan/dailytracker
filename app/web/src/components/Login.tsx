import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Camera, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { api, ok } from "../lib/api";
import { keys } from "../lib/queries";
import { InstallCard } from "./Cards";

interface GIS { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } }
declare global { interface Window { google?: GIS } }

let gis: Promise<void> | null = null;
const loadGis = () => gis ??= new Promise<void>((res, rej) => {
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = () => res(); s.onerror = () => { gis = null; rej(new Error("gis")); };
  document.head.append(s);
});

export function Login() {
  const qc = useQueryClient();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ googleClientId }] = await Promise.all([ok(api.config.$get()), loadGis()]);
        if (dead || !slot.current) return;
        window.google!.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }: { credential: string }) => {
            try { await ok(api["auth"]["google"].$post({ json: { credential } })); await qc.invalidateQueries({ queryKey: keys.me }); }
            catch { toast.error("Gagal masuk. Coba lagi."); }
          },
        });
        window.google!.accounts.id.renderButton(slot.current, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "id", width: 280 });
      } catch { toast.error("Tombol Google tidak bisa dimuat. Periksa koneksi."); }
    })();
    return () => { dead = true; };
  }, [qc]);
  return (
    <div className="loginwrap">
      <section className="loginart" aria-hidden="true">
        <div className="logo"><i />Tugas Harian</div>
        <div>
          <h2>Pekerjaan tim kreatif, rapi dalam satu tempat.</h2>
          <ul>
            <li><span><Columns3 size={18} /></span><div><b>Papan &amp; kalender</b>Bagi tugas, atur jadwal, dan pantau statusnya.</div></li>
            <li><span><Camera size={18} /></span><div><b>Bukti kerja</b>Foto atau tautan hasil dilampirkan saat tugas selesai.</div></li>
            <li><span><BarChart3 size={18} /></span><div><b>Laporan</b>Ketepatan waktu dan beban kerja tiap orang.</div></li>
          </ul>
        </div>
      </section>
      <main className="loginform">
        <div>
          <h1>Masuk</h1>
          <p className="muted">Gunakan akun Google yang emailnya sudah didaftarkan pemilik.</p>
          <div ref={slot} style={{ minHeight: 44, display: "flex", marginTop: 8 }} />
          <InstallCard />
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mark } from "./ui";
import { LoginScene } from "./Illus";
import { toast } from "sonner";
import { api, ok } from "../lib/api";
import { keys } from "../lib/queries";
import { InstallCard } from "./Cards";
import { Legal } from "./Legal";

interface GIS { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } }
declare global { interface Window { google?: GIS } }

let gis: Promise<void> | null = null;
const loadGis = () => gis ??= new Promise<void>((res, rej) => {
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = () => res(); s.onerror = () => { gis = null; rej(new Error("gis")); };
  document.head.append(s);
});

/** Full-page sign-in for browsers where the Google popup stays blank (iPhone): leave to Google, come back with the token posted to the server. */
async function signInByRedirect() {
  try {
    const { googleClientId } = await ok(api.config.$get());
    const state = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
    document.cookie = `th_oauth=${state}; Max-Age=600; Path=/api/auth; Secure; SameSite=None`;
    const q = new URLSearchParams({ client_id: googleClientId, redirect_uri: location.origin + "/api/auth/google-redirect", response_type: "id_token", response_mode: "form_post", scope: "openid email profile", state, nonce: state, prompt: "select_account" });
    location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + q);
  } catch { toast.error("Tidak bisa membuka Google. Periksa koneksi."); }
}

export function Login() {
  const qc = useQueryClient();
  const failed = new URLSearchParams(location.search).get("e") === "login";
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
        window.google!.accounts.id.renderButton(slot.current, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "id", width: Math.min(340, Math.max(220, window.innerWidth - 64)) });
      } catch { toast.error("Tombol Google tidak bisa dimuat. Periksa koneksi."); }
    })();
    return () => { dead = true; };
  }, [qc]);
  return (
    <div className="loginwrap">
      <section className="loginart" aria-hidden="true">
        <div className="logo"><i><Mark /></i>HAN Task Tracker</div>
        <LoginScene />
        <div>
          <h2>Kerja tim kreatif, <em>rapi</em> dalam satu tempat.</h2>
          <p>Papan, kalender, bukti kerja, dan laporan ketepatan waktu untuk seluruh tim.</p>
        </div>
      </section>
      <main className="loginform">
        <div>
          <h1>Masuk</h1>
          <p className="muted">Gunakan akun Google yang emailnya sudah didaftarkan Superadmin.</p>
          {failed && <p className="warnbox" role="alert" style={{ marginTop: 8 }}><span className="warnico" aria-hidden="true">!</span><span className="txt"><b>Masuk gagal</b>Pastikan memakai akun Google yang emailnya terdaftar di tim, lalu coba lagi.</span></p>}
          <div ref={slot} style={{ minHeight: 44, display: "flex", marginTop: 8 }} />
          <button className="btn" style={{ height: 46 }} onClick={signInByRedirect}>Tombol di atas kosong? Masuk lewat halaman Google</button>
          <InstallCard />
          <Legal />
        </div>
      </main>
    </div>
  );
}

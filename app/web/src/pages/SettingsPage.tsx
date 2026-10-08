import { useState } from "react";
import { toast } from "sonner";
import { Page } from "../components/Page";
import { InstallCard } from "../components/Cards";
import { ProfileForm } from "../components/ManageTeam";
import { enablePush, pushSupported, unregisterPush } from "../lib/push";
import { errorText } from "../lib/queries";
import { useTheme, type Theme } from "../lib/theme";
import { useViewer } from "../lib/viewer";

export function SettingsPage() {
  const { me, member } = useViewer();
  const [theme, setTheme] = useTheme();
  const [perm, setPerm] = useState(() => (pushSupported() ? Notification.permission : "unsupported"));
  const m = member(me.email);
  return (
    <Page title="Pengaturan" sub={me.email}>
      <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="surface"><div className="surface-h"><h2>Profil</h2></div>
          {m ? <ProfileForm m={m} onClose={() => { /* stays on the page */ }} /> : <p className="muted">Kamu masuk sebagai pemilik ({me.email}). Pemilik tidak memiliki profil anggota.</p>}
        </section>
        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <section className="surface"><div className="surface-h"><h2>Tampilan</h2></div>
            <div className="seg" role="group" aria-label="Tema">
              {([["system", "Ikuti sistem"], ["light", "Terang"], ["dark", "Gelap"]] as [Theme, string][]).map(([k, l]) => <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>)}
            </div>
          </section>
          <section className="surface"><div className="surface-h"><h2>Notifikasi</h2></div>
            {perm === "unsupported" && <p className="muted">Browser ini belum mendukung notifikasi push. Di iPhone, pasang aplikasi ke layar utama dulu.</p>}
            {perm === "granted" && <><p>Notifikasi aktif di perangkat ini.</p><div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}><button className="btn small" onClick={async () => { await unregisterPush(); toast.success("Notifikasi dimatikan di perangkat ini"); }}>Matikan di perangkat ini</button></div></>}
            {perm === "denied" && <p className="muted">Notifikasi diblokir. Izinkan lewat pengaturan situs di browser, lalu muat ulang.</p>}
            {perm === "default" && <><p className="muted">Dapatkan pemberitahuan tugas baru, pengingat tenggat, dan komentar.</p><div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}><button className="btn primary" onClick={async () => { try { if (await enablePush()) toast.success("Notifikasi aktif di perangkat ini"); } catch (e) { toast.error(errorText(e)); } setPerm(Notification.permission); }}>Aktifkan notifikasi</button></div></>}
          </section>
          <InstallCard />
        </div>
      </div>
    </Page>
  );
}

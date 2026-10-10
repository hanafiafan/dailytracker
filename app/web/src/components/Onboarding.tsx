import { useEffect, useState } from "react";
import { Bell, BellRing, Check, MonitorSmartphone, X } from "lucide-react";
import { toast } from "sonner";
import { api, ok } from "../lib/api";
import { enablePush, pushSupported } from "../lib/push";
import { errorText } from "../lib/queries";
import { promptInstall, useInstallPrompt, useJustInstalled } from "../lib/install";
import { useViewer } from "../lib/viewer";

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const ua = () => navigator.userAgent;
const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(ua());
const isPhone = () => isIOS() && !/macintosh/i.test(ua()) || isAndroid();
const key = (email: string) => "th-setup-" + email;
const done = (email: string) => { if (navigator.webdriver) return true; /* automated test browsers skip the first-run guide */ try { return localStorage.getItem(key(email)) === "1"; } catch { return true; } };
/** Setup is required on every device: until it is finished, or again if notification permission is later taken away. */
export const needsSetup = (email: string) => !done(email) || (!navigator.webdriver && ((pushSupported() && Notification.permission !== "granted") || (isPhone() && !standalone())));

/** What to do to put the app on the home screen, written for this device. */
function installHelp(canPrompt: boolean) {
  if (standalone()) return "Aplikasi sudah terpasang di perangkat ini.";
  if (canPrompt) return "Ketuk Pasang untuk menaruh ikon aplikasi di layar atau desktop.";
  if (isIOS()) return "Di Safari: ketuk tombol Bagikan (kotak dengan panah ke atas), lalu pilih Tambah ke Layar Utama, lalu Tambah. Setelah itu buka aplikasi dari ikon barunya.";
  if (isAndroid()) return "Di Chrome: ketuk menu ⋮ di pojok kanan atas, lalu pilih Instal aplikasi atau Tambahkan ke layar utama.";
  return "Di Chrome/Edge desktop: klik ikon pasang di ujung kanan kolom alamat, atau menu ⋮ lalu Cast, simpan, dan bagikan lalu Instal Tugas Harian.";
}

/** First sign-in on a device: three short steps (install, allow notifications, test them), then "Selesai" so it never shows again. */
export function Onboarding({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const { me } = useViewer();
  const mandatory = !forceOpen; // first-run setup cannot be skipped; the copy opened from Pengaturan can
  const [open, setOpen] = useState(() => !!forceOpen || needsSetup(me.email));
  const evt = useInstallPrompt();
  const [accepted, setAccepted] = useState(false);
  const justInstalled = useJustInstalled();
  const installed = standalone() || accepted || justInstalled;
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => (pushSupported() ? Notification.permission : "unsupported"));
  const [tested, setTested] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  if (!open) return null;

  const close = (finished: boolean) => { if (finished) { try { localStorage.setItem(key(me.email), "1"); } catch { /* private mode */ } } setOpen(false); onClose?.(); };
  const install = async () => { if (await promptInstall()) setAccepted(true); };
  const allow = async () => { try { if (await enablePush()) toast.success("Notifikasi aktif di perangkat ini"); } catch (e) { toast.error(errorText(e)); } if (pushSupported()) setPerm(Notification.permission); };
  const test = async () => {
    setTested("busy");
    try { const r = await ok(api.push.test.$post()) as unknown as { sent: number }; setTested(r.sent ? "ok" : "fail"); if (!r.sent) toast.error("Belum ada perangkat terdaftar atau pengiriman gagal."); }
    catch (e) { setTested("fail"); toast.error(errorText(e)); }
  };
  const iosNeedsInstall = isIOS() && !installed && perm === "default";
  const granted = perm === "granted";
  const ready = (installed || !isPhone()) && granted && tested === "ok"; // on phones the app must be installed (opened from its icon)
  // A browser with no notification support at all can never finish, so it may continue; iPhone must install first since that is what unlocks them.
  const canFinish = ready || (perm === "unsupported" && !isPhone());
  return (
    <>
      <div className="scrim" onClick={mandatory ? undefined : () => close(false)} />
      <div className="dialog onboard" role="dialog" aria-modal="true" aria-label="Siapkan aplikasi">
        <div className="dialog-h"><div><h2>Siapkan Tugas Harian</h2><p className="muted">{mandatory ? "Wajib diselesaikan dulu sebelum memakai aplikasi: " : ""}tiga langkah agar aplikasi mudah dibuka dan notifikasi tiba tepat waktu.</p></div>{!mandatory && <button className="rbtn" aria-label="Tutup" onClick={() => close(false)}><X size={18} /></button>}</div>
        <div className="dialog-b ob-steps">
          <section className={"ob-step" + (installed ? " ok" : "")}>
            <span className="ob-n">{installed ? <Check size={16} /> : 1}</span>
            <div><b>Taruh di layar utama{isPhone() ? " (wajib di HP)" : ""}</b><p className="muted">{installHelp(!!evt)}</p>{isPhone() && !installed && <p className="muted" style={{ fontSize: ".78rem" }}>Setelah terpasang, tutup halaman ini lalu buka aplikasi dari ikon barunya di layar utama.</p>}
              {evt && <button className="btn small primary" onClick={install}><MonitorSmartphone size={14} />Pasang sekarang</button>}</div>
          </section>
          <section className={"ob-step" + (granted ? " ok" : "")}>
            <span className="ob-n">{granted ? <Check size={16} /> : 2}</span>
            <div><b>Izinkan notifikasi</b>
              <p className="muted">{perm === "unsupported" ? "Browser ini belum mendukung notifikasi. Di iPhone, pasang ke layar utama dulu lalu buka dari ikonnya." : perm === "denied" ? "Notifikasi diblokir. Buka pengaturan situs di browser, ubah ke Izinkan, lalu muat ulang." : granted ? "Izin sudah diberikan di perangkat ini." : "Dapatkan pemberitahuan tugas baru, tugas dikembalikan, dan pengingat tenggat."}</p>
              {perm === "default" && <button className="btn small primary" disabled={iosNeedsInstall} onClick={allow}><Bell size={14} />Izinkan notifikasi</button>}
              {iosNeedsInstall && <p className="muted" style={{ fontSize: ".76rem" }}>Di iPhone, selesaikan langkah 1 dulu.</p>}</div>
          </section>
          <section className={"ob-step" + (tested === "ok" ? " ok" : "")}>
            <span className="ob-n">{tested === "ok" ? <Check size={16} /> : 3}</span>
            <div><b>Coba kirim notifikasi uji</b>
              <p className="muted">{tested === "ok" ? "Terkirim. Cek layar atau bar notifikasi perangkatmu." : tested === "fail" ? "Belum berhasil. Pastikan langkah 2 selesai, lalu coba lagi." : "Kami kirim satu pesan percobaan ke perangkat ini."}</p>
              <button className="btn small" disabled={!granted || tested === "busy"} onClick={test}><BellRing size={14} />{tested === "ok" ? "Kirim lagi" : "Kirim notifikasi uji"}</button></div>
          </section>
        </div>
        <div className="dialog-f">
          {mandatory
            ? <><span className="muted" style={{ fontSize: ".8rem", marginRight: "auto" }}>{canFinish ? "" : "Selesaikan ketiga langkah untuk melanjutkan."}</span><button className="btn primary" disabled={!canFinish} onClick={() => close(true)}>Selesai</button></>
            : <><button className="btn ghost" onClick={() => close(false)}>Tutup</button><button className={"btn " + (ready ? "primary" : "")} onClick={() => close(true)}>{ready ? "Selesai" : "Selesai, jangan tampilkan lagi"}</button></>}
        </div>
      </div>
    </>
  );
}

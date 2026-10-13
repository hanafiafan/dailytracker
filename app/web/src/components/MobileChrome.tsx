import { useState } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare,
  BarChart3,
  CalendarDays,
  CalendarOff,
  Camera,
  Columns3,
  FolderKanban,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  Grid2x2,
  BookOpen,
  ShieldCheck,
  ChevronRight,
  CheckSquare,
} from "lucide-react";
import { getTheme, toggleTheme } from "../lib/theme";
import { useUi, useViewer } from "../lib/viewer";
import { useRunning } from "../lib/queries";
import { Bell_ } from "./Bell";
import { Sheet } from "./Sheet";
import { RunningPill } from "./TimeTracker";
import { Avatar } from "./ui";

interface MenuItem {
  to: string;
  label: string;
  desc: string;
  Icon: any;
  color: string;
  manager?: boolean;
  superadmin?: boolean;
}

const SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: "Alur Kerja Utama",
    items: [
      { to: "/daftar", label: "Daftar Tugas", desc: "Semua tugas tim, filter & rekap", Icon: ListChecks, color: "blue" },
      { to: "/papan", label: "Papan Kanban", desc: "Alur kerja visual per status", Icon: Columns3, color: "purple" },
      { to: "/kalender", label: "Kalender Kerja", desc: "Jadwal tenggat & agenda harian", Icon: CalendarDays, color: "orange" },
      { to: "/inbox", label: "Inbox & Diskusi", desc: "Pesan tim & chat 1-on-1", Icon: MessageSquare, color: "emerald" },
    ],
  },
  {
    title: "Manajemen & Tim",
    items: [
      { to: "/tim", label: "Manajemen Tim", desc: "Anggota, peran, divisi & beban kerja", Icon: Users, color: "sky", manager: true },
      { to: "/proyek", label: "Proyek Klien", desc: "Daftar proyek & entitas klien", Icon: FolderKanban, color: "indigo" },
      { to: "/izin", label: "Izin & Cuti", desc: "Pengajuan & persetujuan cuti tim", Icon: CalendarOff, color: "rose" },
      { to: "/laporan", label: "Laporan & Metrik", desc: "Statistik produktivitas & jam kerja", Icon: BarChart3, color: "amber" },
      { to: "/superadmin", label: "Superadmin Center", desc: "Kontrol entitas, akun & audit", Icon: ShieldCheck, color: "red", superadmin: true },
    ],
  },
  {
    title: "Fasilitas & Sistem",
    items: [
      { to: "/alat", label: "Alat & Studio", desc: "Peminjaman alat & ruang studio", Icon: Camera, color: "slate" },
      { to: "/panduan", label: "Panduan SOP", desc: "Petunjuk alur & standar operasional", Icon: BookOpen, color: "lime" },
      { to: "/riwayat", label: "Riwayat Log", desc: "Catatan aktivitas & perubahan data", Icon: History, color: "zinc" },
      { to: "/pengaturan", label: "Pengaturan Akun", desc: "Profil akun & preferensi", Icon: Settings, color: "gray" },
    ],
  },
];

const ALL_MORE = SECTIONS.flatMap(s => s.items);

const TABS = [
  { to: "/", label: "Dasbor", Icon: LayoutDashboard },
  { to: "/papan", label: "Papan", Icon: Columns3 },
  { to: "/kalender", label: "Kalender", Icon: CalendarDays },
  { to: "/inbox", label: "Inbox", Icon: MessageSquare },
  { to: "#menu", label: "Menu", Icon: Grid2x2 },
];

/** Phone shell: Modern docked bottom navigation bar, frosted glass header, and categorized menu drawer */
export function MobileChrome({ waiting, msgs, out }: { waiting: number; msgs: number; out: () => void }) {
  const [loc, go] = useLocation();
  const { me, member, policy } = useViewer();
  const { openSearch, newTask } = useUi();
  const runningQuery = useRunning(true);
  const hasRunning = !!runningQuery.data;

  const [menu, setMenu] = useState(false);
  const [acct, setAcct] = useState(false);
  const [taskChoice, setTaskChoice] = useState(false);

  const m = member(me.email);
  const on = (to: string) => (to === "/" ? loc === "/" : loc.startsWith(to));
  const inMore = ALL_MORE.some(x => on(x.to) && x.to !== "/" && x.to !== "/papan" && x.to !== "/kalender" && x.to !== "/inbox");

  const MENU_IDX = 4;
  const idx = menu || inMore ? MENU_IDX : Math.max(0, TABS.findIndex(t => t.to !== "#menu" && on(t.to)));

  const badge = (to: string) => (to === "/inbox" ? msgs : to === "#menu" ? waiting : 0);
  const dark = getTheme() === "dark";

  const handlePlus = () => {
    if (policy.isManager) {
      setTaskChoice(true);
    } else {
      newTask({ mode: "self", emails: [me.email] });
    }
  };

  return (
    <>
      <header className="mhead">
        <button className="rbtn avatarbtn" onClick={() => setAcct(true)} aria-label="Akun">
          {m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}
          <span className="online-dot" />
        </button>

        <div className="mhead-mid">
          <RunningPill />
          {!hasRunning && (
            <div className="mhead-brand">
              <span className="brand-dot" />
              <span className="brand-name">HAN Daily</span>
            </div>
          )}
        </div>

        <button className="rbtn" onClick={openSearch} aria-label="Cari">
          <Search size={18} />
        </button>
        <button className="rbtn plus" onClick={handlePlus} aria-label="Tugas baru">
          <Plus size={20} />
        </button>
        <Bell_ />
      </header>

      {/* Docked Modern Bottom Bar */}
      <nav className="mbar" aria-label="Menu utama">
        <div className="mbar-track">
          <div className="mbar-pill" style={{ transform: `translateX(${idx * 100}%)` }} aria-hidden="true" />
        </div>
        <ul>
          {TABS.map((t, i) => {
            const sel = i === idx;
            const n = badge(t.to);
            const body = (
              <>
                <span className="mico">
                  <t.Icon size={20} strokeWidth={sel ? 2.3 : 1.9} />
                  {n > 0 && <i className="navdot">{n > 99 ? "99+" : n}</i>}
                </span>
                <span className="mlab">{t.label}</span>
              </>
            );
            return (
              <li key={t.to}>
                {t.to === "#menu" ? (
                  <button
                    className={"mnav" + (sel ? " on" : "")}
                    onClick={() => setMenu(true)}
                    aria-label="Menu lainnya"
                    aria-haspopup="dialog"
                  >
                    {body}
                  </button>
                ) : (
                  <a
                    href={t.to}
                    className={"mnav" + (sel ? " on" : "")}
                    aria-current={sel ? "page" : undefined}
                    onClick={e => {
                      e.preventDefault();
                      go(t.to);
                    }}
                  >
                    {body}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Modern Categorized Menu Drawer */}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu & Navigasi">
        <div className="mhub">
          {/* Quick Search Shortcut */}
          <button
            className="mhub-search"
            onClick={() => {
              setMenu(false);
              openSearch();
            }}
          >
            <Search size={16} />
            <span>Cari tugas, proyek, atau tim...</span>
          </button>

          {/* Quick Action Buttons */}
          <div className="mhub-quick">
            <button
              className="mhub-quick-btn primary"
              onClick={() => {
                setMenu(false);
                handlePlus();
              }}
            >
              <Plus size={16} />
              <span>Tugas Baru</span>
            </button>
            <button
              className="mhub-quick-btn"
              onClick={() => {
                setMenu(false);
                go("/daftar");
              }}
            >
              <ListChecks size={16} />
              <span>Semua Tugas</span>
            </button>
          </div>

          {/* Grouped Sections */}
          {SECTIONS.map(sec => {
            const visible = sec.items.filter(
              x => (!x.manager || policy.isManager) && (!x.superadmin || policy.isSuper)
            );
            if (!visible.length) return null;
            return (
              <div key={sec.title} className="mhub-group">
                <div className="mhub-group-title">{sec.title}</div>
                <div className="mhub-card">
                  {visible.map(({ to, label, desc, Icon, color }) => {
                    const badgeCount = to === "/izin" ? waiting : to === "/inbox" ? msgs : 0;
                    return (
                      <button
                        key={to}
                        className="mhub-item"
                        onClick={() => {
                          setMenu(false);
                          go(to);
                        }}
                      >
                        <div className={`mhub-icon ${color}`}>
                          <Icon size={19} />
                        </div>
                        <div className="mhub-text">
                          <div className="mhub-label">{label}</div>
                          <div className="mhub-desc">{desc}</div>
                        </div>
                        {badgeCount > 0 && (
                          <span className="navdot">{badgeCount > 99 ? "99+" : badgeCount}</span>
                        )}
                        <ChevronRight size={16} className="mhub-arr" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Sheet>

      {/* Task Creation Choice Sheet */}
      <Sheet open={taskChoice} onClose={() => setTaskChoice(false)} title="Tambah Tugas Baru">
        <div className="task-choice-sheet">
          <button
            className="task-choice-card team"
            onClick={() => {
              setTaskChoice(false);
              newTask({ mode: "team" });
            }}
          >
            <div className="tcc-icon">
              <Users size={22} />
            </div>
            <div className="tcc-info">
              <b>Tugas untuk Tim</b>
              <small>Tugaskan tugas ke anggota atau seluruh divisi tim</small>
            </div>
            <ChevronRight size={18} className="tcc-arr" />
          </button>

          <button
            className="task-choice-card self"
            onClick={() => {
              setTaskChoice(false);
              newTask({ mode: "self", emails: [me.email] });
            }}
          >
            <div className="tcc-icon">
              <CheckSquare size={22} />
            </div>
            <div className="tcc-info">
              <b>Tugas Diri Sendiri</b>
              <small>Target pribadi, checklist mandiri &amp; lampirkan bukti instan</small>
            </div>
            <ChevronRight size={18} className="tcc-arr" />
          </button>
        </div>
      </Sheet>

      {/* Modern Account Sheet */}
      <Sheet open={acct} onClose={() => setAcct(false)} title="Akun Saya">
        <div className="acct-card">
          <div className="acct-av">
            {m ? <Avatar m={m} big /> : <span className="avatar big" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}
            <span className="acct-status-dot" />
          </div>
          <div className="acct-meta">
            <b className="acct-name clamp1">{m?.name ?? me.name}</b>
            <div className="acct-role-row">
              <span className="acct-role-badge">{m?.role || (me.owner ? "Superadmin" : "Anggota")}</span>
              {me.owner && <span className="acct-super-badge">Owner</span>}
            </div>
            <small className="acct-email clamp1">{me.email}</small>
          </div>
        </div>

        <div className="acct-actions">
          <button
            className="acct-row"
            onClick={() => {
              setAcct(false);
              go("/pengaturan");
            }}
          >
            <div className="acct-row-ico">
              <Settings size={18} />
            </div>
            <div className="acct-row-text">
              <b>Pengaturan Profil</b>
              <small>Ubah foto, kata sandi &amp; preferensi akun</small>
            </div>
            <ChevronRight size={16} className="acct-row-arr" />
          </button>

          <button className="acct-row" onClick={() => toggleTheme()}>
            <div className="acct-row-ico">{dark ? <Sun size={18} /> : <Moon size={18} />}</div>
            <div className="acct-row-text">
              <b>Tampilan Tema</b>
              <small>{dark ? "Sedang aktif: Mode Gelap" : "Sedang aktif: Mode Terang"}</small>
            </div>
            <div className={`theme-toggle-pill ${dark ? "dark" : "light"}`}>
              <span className="toggle-thumb" />
            </div>
          </button>

          {policy.isSuper && (
            <button
              className="acct-row"
              onClick={() => {
                setAcct(false);
                go("/superadmin");
              }}
            >
              <div className="acct-row-ico red">
                <ShieldCheck size={18} />
              </div>
              <div className="acct-row-text">
                <b>Superadmin Center</b>
                <small>Kelola entitas, akun, backup &amp; audit</small>
              </div>
              <ChevronRight size={16} className="acct-row-arr" />
            </button>
          )}

          <button className="acct-row danger" onClick={out}>
            <div className="acct-row-ico red">
              <LogOut size={18} />
            </div>
            <div className="acct-row-text">
              <b>Keluar dari Akun</b>
              <small>Akhiri sesi kerja perangkat ini</small>
            </div>
            <ChevronRight size={16} className="acct-row-arr" />
          </button>
        </div>
      </Sheet>
    </>
  );
}

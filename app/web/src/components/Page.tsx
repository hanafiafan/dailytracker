import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getTheme, toggleTheme } from "../lib/theme";
import { MessageSquare, Camera, CalendarOff, Bell, Moon, Sun, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, History, LayoutDashboard, Columns3, ListChecks, Plus, Search, Settings, Users, BarChart3, LogOut, BookOpen, Sparkles, CheckSquare, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { pushSupported, unregisterPush } from "../lib/push";
import { keys, useChannels, useInbox, useLeaves } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar } from "./ui";
import { Mark } from "./ui";
import { RunningPill } from "./TimeTracker";
import { Bell_ } from "./Bell";
import { logout } from "../lib/session";
import { MobileChrome } from "./MobileChrome";
import { useIsMobile } from "../lib/useMedia";

const NAV = [
  { to: "/", label: "Dasbor", Icon: LayoutDashboard },
  { to: "/papan", label: "Papan", Icon: Columns3 },
  { to: "/daftar", label: "Daftar", Icon: ListChecks },
  { to: "/kalender", label: "Kalender", Icon: CalendarDays },
  { to: "/proyek", label: "Proyek", Icon: FolderKanban },
  { to: "/tim", label: "Tim", Icon: Users, manager: true },
  { to: "/inbox", label: "Inbox", Icon: MessageSquare },
  { to: "/alat", label: "Alat", Icon: Camera },
  { to: "/izin", label: "Izin", Icon: CalendarOff },
  { to: "/laporan", label: "Laporan", Icon: BarChart3 },
  { to: "/riwayat", label: "Riwayat", Icon: History },
  { to: "/superadmin", label: "Superadmin", Icon: ShieldCheck, superadmin: true },
];

/** Floating pill header: logo, page menu, search, bell and the account menu. */
export function TopNav() {
  const [loc, go] = useLocation();
  const { policy, me, member } = useViewer();
  const { openSearch, newTask } = useUi();
  const qc = useQueryClient();
  const m = member(me.email);
  const [menu, setMenu] = useState(false);
  const msgs = (useChannels().data ?? []).reduce((s, c) => s + c.unread, 0);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { navRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [loc]);
  const waiting = (useLeaves(true).data ?? []).filter(l => l.status === "pending" && l.email !== me.email && policy.canManage(l.email)).length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [menu]);
  const mobile = useIsMobile();
  const out = logout;
  if (mobile) return <MobileChrome waiting={waiting} msgs={msgs} out={out} />;
  return (
    <header className="topnav">
      <div className="logo"><i><Mark /></i><span className="t">HAN Task Tracker</span></div>
      <nav className="pillnav" aria-label="Menu utama" ref={navRef}>
        {NAV.filter(n => (!n.manager || policy.isManager) && (!n.superadmin || policy.isSuper)).map(({ to, label, Icon }) => (
          <a key={to} href={to} aria-current={(to === "/" ? loc === "/" : loc.startsWith(to)) ? "page" : undefined} aria-label={label}
            onClick={e => { e.preventDefault(); go(to); }}><Icon /><span>{label}</span>{to === "/izin" && waiting > 0 && <i className="navdot">{waiting}</i>}{to === "/inbox" && msgs > 0 && <i className="navdot">{msgs > 99 ? "99+" : msgs}</i>}</a>
        ))}
      </nav>
      <div className="navtools">
        <RunningPill />
        <button className="tool addtool" onClick={() => newTask()} aria-label="Tugas baru"><Plus size={18} /></button>
        <button className="tool" onClick={openSearch} aria-label="Cari (Ctrl+K)" title="Cari (Ctrl+K)"><Search size={17} /></button>
        <Bell_ />
        <div className="usermenu" ref={ref}>
          <button className="tool" onClick={() => setMenu(o => !o)} aria-label="Akun" aria-expanded={menu}>
            {m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}<ChevronDown size={14} />
          </button>
          {menu && (
            <div className="popover" role="menu" style={{ minWidth: 240, maxWidth: 300 }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <b className="clamp1">{m?.name ?? me.name}</b>
                <small className="muted clamp1" style={{ display: "block" }}>{m?.role || (me.owner ? "Superadmin" : me.email)}</small>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {m?.level && <span className="tag proj" style={{ fontSize: ".7rem" }}>{m.level}</span>}
                  {m?.group && <span className="tag due" style={{ fontSize: ".7rem" }}>{m.group}</span>}
                  {m?.accountType === "client" && <span className="tag off" style={{ fontSize: ".7rem" }}>Klien</span>}
                </div>
                {m?.jobdesk && <p className="muted clamp2" style={{ fontSize: ".75rem", marginTop: 6, lineHeight: 1.3 }} title={m.jobdesk}>{m.jobdesk}</p>}
              </div>
              <button className="menuitem" role="menuitem" onClick={() => { setMenu(false); go("/panduan"); }}><BookOpen size={16} /><span>Panduan</span></button>
              <button className="menuitem" role="menuitem" onClick={() => { setMenu(false); go("/pengaturan"); }}><Settings size={16} /><span>Pengaturan</span></button>
              <button className="menuitem" role="menuitem" onClick={() => { toggleTheme(); setMenu(false); }}>{getTheme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span>{getTheme() === "dark" ? "Mode terang" : "Mode gelap"}</span></button>
              <button className="menuitem" role="menuitem" onClick={out}><LogOut size={16} /><span>Keluar</span></button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Page frame: title, optional day navigation and actions, then the optional tab row. */
export function NewTaskHeaderButton() {
  const { policy, me } = useViewer();
  const { newTask } = useUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);

  if (!policy.isManager) {
    return (
      <button
        className="btn blue hide-mobile"
        style={{ height: 40 }}
        onClick={() => newTask({ mode: "self", emails: [me.email] })}
      >
        <Plus size={16} />
        Tugas baru
      </button>
    );
  }

  return (
    <div className="usermenu hide-mobile" ref={ref} style={{ display: "inline-block" }}>
      <button
        className="btn blue"
        style={{ height: 40, gap: 6, paddingRight: 10 }}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <Plus size={16} />
        Tambah tugas
        <ChevronDown size={14} style={{ opacity: 0.8, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div
          className="popover"
          role="menu"
          style={{ minWidth: 290, right: 0, top: "calc(100% + 6px)", padding: 6, zIndex: 60 }}
        >
          <button
            type="button"
            className="menuitem"
            style={{ padding: "10px 12px", borderRadius: 10, display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}
            onClick={() => { setOpen(false); newTask({ mode: "team" }); }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(59, 130, 246, 0.12)", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--fg)" }}>Tugas untuk Tim</div>
              <div className="muted" style={{ fontSize: "0.74rem", fontWeight: 400, marginTop: 1 }}>Tugaskan ke anggota atau seluruh tim</div>
            </div>
          </button>

          <button
            type="button"
            className="menuitem"
            style={{ padding: "10px 12px", borderRadius: 10, display: "flex", gap: 12, alignItems: "center", textAlign: "left", marginTop: 2 }}
            onClick={() => { setOpen(false); newTask({ mode: "self", emails: [me.email] }); }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--canvas)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckSquare size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--ink)" }}>Tugas Diri Sendiri</div>
              <div className="muted" style={{ fontSize: "0.74rem", fontWeight: 400, marginTop: 1 }}>Target, durasi, checklist &amp; referensi mandiri</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export function Page({ title, sub, tabs, tab, onTab, dateNav, children, actions, noNew, back }: {
  title: ReactNode; sub?: ReactNode; tabs?: { id: string; label: string }[]; tab?: string; onTab?: (id: string) => void;
  dateNav?: boolean; actions?: ReactNode; children: ReactNode; noNew?: boolean; back?: string;
}) {
  const { date, setDate } = useUi();
  const t = today();
  const [, goBack] = useLocation();
  return (
    <div className="page">
      {back && <button className="rbtn backbtn" onClick={() => goBack(back)} aria-label="Kembali"><ChevronLeft size={20} /></button>}
      <div className="topbar">
        <div style={{ minWidth: 0, flex: "1 1 260px" }}><h1 className="clamp1">{title}</h1>{sub && <p className="clamp1">{sub}</p>}</div>
        <div className="chips" style={{ gap: 10 }}>
          {dateNav && (
            <div className="datepill" role="group" aria-label="Pilih hari">
              <button aria-label="Hari sebelumnya" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={16} /></button>
              <button className="mid" onClick={() => setDate(t)} title="Kembali ke hari ini"><CalendarDays size={15} />{date === t ? "Hari ini · " : ""}{fmtShort(date)}</button>
              <button aria-label="Hari berikutnya" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={16} /></button>
            </div>
          )}
          {!noNew && <NewTaskHeaderButton />}
        </div>
      </div>
      {(tabs || actions) && (
        <div className="tabs">
          {tabs && <div className="tablist" role="tablist">{tabs.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => onTab?.(x.id)}>{x.label}</button>)}</div>}
          {actions && <div className="grow">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

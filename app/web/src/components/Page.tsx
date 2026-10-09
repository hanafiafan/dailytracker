import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getTheme, toggleTheme } from "../lib/theme";
import { MessageSquare, Camera, CalendarOff, Bell, Moon, Sun, CalendarDays, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, History, LayoutDashboard, Columns3, ListChecks, Plus, Search, Settings, Users, BarChart3, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { pushSupported, unregisterPush } from "../lib/push";
import { keys, useChannels, useInbox, useLeaves } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar } from "./ui";
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
      <div className="logo"><i><CheckCheck size={18} /></i><span className="t">Tugas Harian</span></div>
      <nav className="pillnav" aria-label="Menu utama" ref={navRef}>
        {NAV.filter(n => !n.manager || policy.isManager).map(({ to, label, Icon }) => (
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
            <div className="popover" role="menu" style={{ minWidth: 220 }}>
              <div style={{ padding: "8px 12px" }}><b className="clamp1">{m?.name ?? me.name}</b><small className="muted clamp1">{m?.role || (me.owner ? "Pemilik" : me.email)}</small></div>
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
export function Page({ title, sub, tabs, tab, onTab, dateNav, children, actions, noNew, back }: {
  title: ReactNode; sub?: ReactNode; tabs?: { id: string; label: string }[]; tab?: string; onTab?: (id: string) => void;
  dateNav?: boolean; actions?: ReactNode; children: ReactNode; noNew?: boolean; back?: string;
}) {
  const { policy } = useViewer();
  const { date, setDate, newTask } = useUi();
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
          {!noNew && <button className="btn blue hide-mobile" style={{ height: 40 }} onClick={() => newTask()}><Plus size={16} />{policy.isManager ? "Tambah tugas" : "Tugas baru"}</button>}
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

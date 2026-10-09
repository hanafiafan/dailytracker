import { useState } from "react";
import { useLocation } from "wouter";
import { MessageSquare, ArrowUpRight, BarChart3, CalendarDays, CalendarOff, Camera, Columns3, FolderKanban, History, LayoutDashboard, ListChecks, LogOut, Moon, Plus, Search, Settings, Sun, Users, Grid2x2 } from "lucide-react";
import { getTheme, toggleTheme } from "../lib/theme";
import { useUi, useViewer } from "../lib/viewer";
import { Bell_ } from "./Bell";
import { Sheet } from "./Sheet";
import { RunningPill } from "./TimeTracker";
import { Avatar } from "./ui";

const MORE = [
  { to: "/daftar", label: "Daftar tugas", Icon: ListChecks, tone: "lime" },
  { to: "/proyek", label: "Proyek", Icon: FolderKanban, tone: "dark" },
  { to: "/tim", label: "Tim", Icon: Users, manager: true, tone: "gray" },
  { to: "/alat", label: "Alat & studio", Icon: Camera, tone: "gray" },
  { to: "/izin", label: "Izin & cuti", Icon: CalendarOff, tone: "coral" },
  { to: "/laporan", label: "Laporan", Icon: BarChart3, tone: "dark" },
  { to: "/riwayat", label: "Riwayat", Icon: History, tone: "gray" },
  { to: "/pengaturan", label: "Pengaturan", Icon: Settings, tone: "gray" },
];

/** Phone shell: round-button header and a floating bottom bar (Dasbor, Papan, + , Kalender, Menu). Everything else lives in the Menu sheet. */
export function MobileChrome({ waiting, msgs, out }: { waiting: number; msgs: number; out: () => void }) {
  const [loc, go] = useLocation();
  const { me, member, policy } = useViewer();
  const { openSearch, newTask } = useUi();
  const [menu, setMenu] = useState(false), [acct, setAcct] = useState(false);
  const m = member(me.email);
  const on = (to: string) => (to === "/" ? loc === "/" : loc.startsWith(to));
  const inMore = MORE.some(x => on(x.to));
  const MENU = 4;
  const TABS = [
    { to: "/", label: "Dasbor", Icon: LayoutDashboard }, { to: "/papan", label: "Papan", Icon: Columns3 }, { to: "/kalender", label: "Kalender", Icon: CalendarDays },
    { to: "/inbox", label: "Inbox", Icon: MessageSquare }, { to: "#menu", label: "Menu", Icon: Grid2x2 },
  ];
  // the bubble sits over the current page's item; on pages that live in the Menu (or while the sheet is open) it sits over Menu
  const idx = menu || inMore ? MENU : Math.max(0, TABS.findIndex(t => t.to !== "#menu" && on(t.to)));
  const Active = TABS[idx]!.Icon;
  const badge = (to: string) => to === "/inbox" ? msgs : to === "#menu" ? waiting + (idx === 3 ? 0 : 0) : 0;
  const dark = getTheme() === "dark";
  return (
    <>
      <header className="mhead">
        <button className="rbtn avatarbtn" onClick={() => setAcct(true)} aria-label="Akun">{m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}</button>
        <div className="mhead-mid"><RunningPill /></div>
        <button className="rbtn" onClick={openSearch} aria-label="Cari"><Search size={18} /></button>
        <button className="rbtn plus" onClick={() => newTask()} aria-label="Tugas baru"><Plus size={20} /></button>
        <Bell_ />
      </header>
      <nav className="mbar" aria-label="Menu utama" style={{ ["--i" as string]: idx }}>
        <div className="mbar-bg" aria-hidden="true" />
        <span className="mbubble" aria-hidden="true"><span key={idx} className="mpop"><Active size={24} strokeWidth={2.2} /></span></span>
        <ul>{TABS.map((t, i) => {
          const sel = i === idx, n = badge(t.to);
          const body = <><span className="mico"><t.Icon size={22} />{n > 0 && !sel && <i className="navdot">{n > 99 ? "99+" : n}</i>}</span><span className="mlab">{t.label}</span></>;
          return <li key={t.to}>{t.to === "#menu"
            ? <button className={"mnav" + (sel ? " on" : "")} onClick={() => setMenu(true)} aria-label="Menu lainnya" aria-haspopup="dialog">{body}</button>
            : <a href={t.to} className={"mnav" + (sel ? " on" : "")} aria-current={sel ? "page" : undefined} onClick={e => { e.preventDefault(); go(t.to); }}>{body}</a>}</li>;
        })}</ul>
      </nav>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Semua halaman">
        <div className="mtiles">
          {MORE.filter(x => !x.manager || policy.isManager).map(({ to, label, Icon, tone }) => (
            <button key={to} className={"mtile " + tone} onClick={() => { setMenu(false); go(to); }}>
              <span className="mt-ico"><Icon size={20} /></span><b>{label}</b><span className="mt-go"><ArrowUpRight size={16} /></span>
              {to === "/izin" && waiting > 0 && <i className="navdot">{waiting}</i>}{to === "/inbox" && msgs > 0 && <i className="navdot">{msgs}</i>}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={acct} onClose={() => setAcct(false)} title="Akun">
        <div className="acct">
          {m ? <Avatar m={m} big /> : <span className="avatar big" style={{ background: "var(--ink)", color: "var(--volt)" }}>{me.name[0]}</span>}
          <div style={{ minWidth: 0 }}><b className="clamp1">{m?.name ?? me.name}</b><small className="muted clamp1" style={{ display: "block" }}>{m?.role || (me.owner ? "Pemilik" : me.email)}</small><small className="muted clamp1" style={{ display: "block" }}>{me.email}</small></div>
        </div>
        <div className="alist" style={{ marginTop: 10 }}>
          <button className="menuitem" onClick={() => { setAcct(false); go("/pengaturan"); }}><Settings size={18} /><span>Pengaturan</span></button>
          <button className="menuitem" onClick={() => { toggleTheme(); setAcct(false); }}>{dark ? <Sun size={18} /> : <Moon size={18} />}<span>{dark ? "Mode terang" : "Mode gelap"}</span></button>
          <button className="menuitem" onClick={out}><LogOut size={18} /><span>Keluar</span></button>
        </div>
      </Sheet>
    </>
  );
}

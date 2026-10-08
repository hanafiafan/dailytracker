import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, LayoutDashboard, Columns3, Plus, Search, Settings, Users, BarChart3, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { pushSupported, unregisterPush } from "../lib/push";
import { keys, useInbox } from "../lib/queries";
import { useUi, useViewer } from "../lib/viewer";
import { Avatar } from "./ui";

const NAV = [
  { to: "/", label: "Dasbor", Icon: LayoutDashboard, c: "lilac" },
  { to: "/papan", label: "Papan", Icon: Columns3, c: "sky" },
  { to: "/kalender", label: "Kalender", Icon: CalendarDays, c: "peach" },
  { to: "/tim", label: "Tim", Icon: Users, manager: true, c: "mint" },
  { to: "/laporan", label: "Laporan", Icon: BarChart3, c: "pink" },
  { to: "/pengaturan", label: "Pengaturan", Icon: Settings, c: "yellow" },
];

export function Sidebar() {
  const [loc, go] = useLocation();
  const { policy, me, member } = useViewer();
  const qc = useQueryClient();
  const m = member(me.email);
  const out = async () => {
    if (pushSupported() && Notification.permission === "granted") await unregisterPush();
    await ok(api.auth.logout.$post());
    qc.clear();
    await qc.invalidateQueries({ queryKey: keys.me });
  };
  return (
    <aside className="side">
      <div className="logo"><i />Tugas Harian</div>
      <div className="navlabel">Menu</div>
      <nav className="nav" aria-label="Menu utama">
        {NAV.filter(n => !n.manager || policy.isManager).map(({ to, label, Icon, c }) => (
          <a key={to} data-c={c} href={to} aria-current={(to === "/" ? loc === "/" : loc.startsWith(to)) ? "page" : undefined} aria-label={label}
            onClick={e => { e.preventDefault(); go(to); }}><Icon size={19} />{label}</a>
        ))}
      </nav>
      <div className="spacer" />
      <button className="me hide-sm" onClick={() => go("/pengaturan")} aria-label="Profil saya">
        {m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--dark)", color: "var(--dark-ink)" }}>{me.name[0]}</span>}
        <span><b className="clamp1">{m?.name ?? me.name}</b><small>{m?.role || (me.owner ? "Pemilik" : me.email)}</small></span>
      </button>
      <nav className="nav hide-sm"><button onClick={out}><LogOut size={19} />Keluar</button></nav>
    </aside>
  );
}

function Bell_() {
  const { openTask } = useUi();
  const inbox = useInbox(true), qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  const read = async (ids?: string[]) => { await ok(api.inbox.notifications.read.$post({ json: { ids } })); await qc.invalidateQueries({ queryKey: keys.inbox }); };
  const unread = inbox.data?.unread ?? 0;
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`; };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="tool" onClick={() => setOpen(o => !o)} aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`} aria-expanded={open}><Bell size={18} />{unread > 0 && <span className="dot-badge">{unread > 9 ? "9+" : unread}</span>}</button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifikasi">
          <div className="surface-h" style={{ margin: "2px 6px" }}><b>Notifikasi</b>{unread > 0 && <button className="linkbtn" onClick={() => read()}>Tandai semua dibaca</button>}</div>
          {(inbox.data?.items ?? []).map(n => (
            <button key={n.id} className={"notif" + (n.read ? "" : " unread")} onClick={() => { setOpen(false); void read([n.id]); if (n.taskId) openTask(n.taskId); }}>
              <i /><span><span className="clamp3">{n.text}</span><small>{ago(n.at)}</small></span>
            </button>
          ))}
          {!inbox.data?.items.length && <p className="empty">Belum ada notifikasi.</p>}
        </div>
      )}
    </div>
  );
}

/** Page frame: greeting, tools (search, theme, bell, new task, profile), optional day navigation and tab row. */
export function Page({ title, sub, tabs, tab, onTab, dateNav, children, actions }: {
  title: string; sub?: ReactNode; tabs?: { id: string; label: string }[]; tab?: string; onTab?: (id: string) => void;
  dateNav?: boolean; actions?: ReactNode; children: ReactNode;
}) {
  const { me, member, policy } = useViewer();
  const { date, setDate, openSearch, newTask } = useUi();
  const [, go] = useLocation();
  const m = member(me.email);
  const t = today();
  return (
    <div className="page">
      <div className="topbar">
        <div style={{ minWidth: 0, flex: "1 1 260px" }}><h1 className="clamp1" title={title}>{title}</h1>{sub && <p className="clamp1">{sub}</p>}</div>
        <div className="chips" style={{ gap: 10 }}>
          {dateNav && (
            <div className="tools" role="group" aria-label="Pilih hari">
              <button className="tool" aria-label="Hari sebelumnya" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={18} /></button>
              <button className="tool" style={{ padding: "0 12px", fontWeight: 600, fontSize: ".85rem", minWidth: 96 }} onClick={() => setDate(t)} title="Kembali ke hari ini">{date === t ? "Hari ini" : fmtShort(date)}</button>
              <button className="tool" aria-label="Hari berikutnya" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={18} /></button>
            </div>
          )}
          <div className="tools">
            <button className="tool" onClick={openSearch} aria-label="Cari (Ctrl+K)" title="Cari (Ctrl+K)"><Search size={18} /></button>
            <Bell_ />
            <button className="tool" onClick={() => go("/pengaturan")} aria-label="Profil saya" style={{ padding: 0 }}>{m ? <Avatar m={m} /> : <span className="avatar" style={{ background: "var(--dark)", color: "var(--dark-ink)" }}>{me.name[0]}</span>}</button>
          </div>
          <button className="btn primary hide-mobile" onClick={() => newTask()}><Plus size={16} />{policy.isManager ? "Tambah tugas" : "Tugas baru"}</button>
        </div>
      </div>
      <button className="fab" onClick={() => newTask()} aria-label="Tugas baru"><Plus size={24} /></button>
      {(tabs || actions) && (
        <div className="tabs" role="tablist">
          {tabs?.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => onTab?.(x.id)}>{x.label}</button>)}
          {actions && <div className="grow">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

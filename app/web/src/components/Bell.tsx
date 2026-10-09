import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ok } from "../lib/api";
import { keys, useInbox } from "../lib/queries";
import { useUi } from "../lib/viewer";

export function Bell_() {
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


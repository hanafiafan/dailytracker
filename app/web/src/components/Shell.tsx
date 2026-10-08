import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { fmtShort, today } from "../lib/format";
import { unregisterPush, pushSupported } from "../lib/push";
import { keys } from "../lib/queries";
import { useViewer } from "../lib/viewer";

export function DateNav({ date, onDate }: { date: string; onDate: (d: string) => void }) {
  const t = today();
  return (
    <div className="datenav">
      <button className="iconbtn" aria-label="Hari sebelumnya" onClick={() => onDate(addDays(date, -1))}>‹</button>
      <div className="lbl"><small>{date === t ? "Hari ini" : date < t ? "Lewat" : "Mendatang"}</small>{fmtShort(date)}</div>
      <button className="iconbtn" aria-label="Hari berikutnya" onClick={() => onDate(addDays(date, 1))}>›</button>
      {date !== t && <button className="btn small" onClick={() => onDate(t)}>Hari ini</button>}
    </div>
  );
}

export function UserChip() {
  const { me } = useViewer();
  const qc = useQueryClient();
  const out = async () => {
    if (pushSupported() && Notification.permission === "granted") await unregisterPush();
    await ok(api.auth.logout.$post());
    qc.clear();
    await qc.invalidateQueries({ queryKey: keys.me });
  };
  return <div className="userchip"><span title={me.email}>{me.email}</span><button className="linkbtn" onClick={out}>Keluar</button></div>;
}

export function Header({ narrow, children }: { narrow?: boolean; children: ReactNode }) {
  return <header className="top"><div className="top-in" style={narrow ? { maxWidth: 680 } : undefined}>{children}<UserChip /></div></header>;
}

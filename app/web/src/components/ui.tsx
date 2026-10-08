import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MemberDTO, Status } from "@shared/schemas";
import { hue, initials } from "../lib/format";

export function Avatar({ m, big, src }: { m: Pick<MemberDTO, "email" | "name" | "role" | "hasPhoto" | "photoV">; big?: boolean; src?: string | null }) {
  const cls = "avatar" + (big ? " big" : "");
  const url = src !== undefined ? src : m.hasPhoto ? `/api/team/${encodeURIComponent(m.email)}/photo?v=${m.photoV}` : null;
  if (url) return <img className={cls} src={url} alt="" />;
  return <div className={cls} style={{ background: `hsl(${hue(m.role || m.name || "")} 52% 42%)` }} aria-hidden="true">{initials(m.name || "?")}</div>;
}

/** Two-tap button: the first tap arms it (and shows `armed`), the second runs `onConfirm`. Disarms after 3 s. */
export function ConfirmButton({ label, armed, onConfirm, className, ariaLabel }: { label: ReactNode; armed: ReactNode; onConfirm: () => void; className: string; ariaLabel?: string }) {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" aria-label={ariaLabel} className={className + (on ? " arm" : "")} onClick={() => {
      if (!on) { setOn(true); t.current = setTimeout(() => setOn(false), 3000); return; }
      clearTimeout(t.current); setOn(false); onConfirm();
    }}>{on ? armed : label}</button>
  );
}

export function Bar({ c, total }: { c: Record<Status, number>; total: number }) {
  const p = (n: number) => (total ? (n / total * 100).toFixed(2) + "%" : "0");
  return (
    <div className="stackbar" role="img" aria-label={`${c.done} selesai, ${c.doing} dikerjakan, ${c.todo} belum`}>
      <i className="s-done" style={{ width: p(c.done) }} /><i className="s-doing" style={{ width: p(c.doing) }} />
    </div>
  );
}
export const tally = (list: { status: Status }[]) => {
  const c: Record<Status, number> = { todo: 0, doing: 0, done: 0 };
  for (const t of list) c[t.status]++;
  return c;
};

export const Center = ({ children }: { children: ReactNode }) => <div className="center"><div>{children}</div></div>;
export const Loading = () => <Center><p className="muted">Memuat tugas…</p></Center>;

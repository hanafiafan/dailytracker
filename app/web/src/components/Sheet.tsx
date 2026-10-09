import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Bottom sheet for phones: a handle, a title, and content that scrolls inside. Esc or a tap outside closes it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-h"><h2>{title}</h2><button className="rbtn" aria-label="Tutup" onClick={onClose}><X size={18} /></button></div>
        <div className="sheet-b">{children}</div>
      </div>
    </>
  );
}

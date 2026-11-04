import { useState } from "react";
import { AlertCircle, PauseCircle, X } from "lucide-react";

export function HoldModal({
  taskTitle,
  onClose,
  onSubmit,
  isPending,
}: {
  taskTitle: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending?: boolean;
}) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = reason.trim();
    if (!r) return;
    onSubmit(r);
  };

  return (
    <>
      <div className="scrim" style={{ zIndex: 90 }} onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Hold Tugas" style={{ zIndex: 91, maxWidth: 440 }}>
        <header className="dialog-h">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PauseCircle size={18} style={{ color: "#d97706" }} />
            <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Hold Tugas</h3>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="dialog-b" style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10, padding: "10px 12px", fontSize: "0.82rem", color: "var(--ink)", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertCircle size={16} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
              <div>
                Status tugas akan diubah menjadi <b>Hold</b> (tertunda). Wajib sertakan alasan atau kendala kenapa tugas ini di-hold.
              </div>
            </div>

            {taskTitle && (
              <div style={{ fontSize: "0.86rem", color: "var(--ink)" }}>
                <span className="muted">Tugas:</span> <b>{taskTitle}</b>
              </div>
            )}

            <label style={{ display: "grid", gap: 6 }}>
              <span className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Alasan / Keterangan Hold <b style={{ color: "var(--bad)" }}>*</b></span>
                <small className="muted">{reason.length}/300</small>
              </span>
              <textarea
                className="input"
                rows={3}
                maxLength={300}
                required
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Contoh: Menunggu materi dari client, terkendala akses server, dll..."
                autoFocus
                style={{ resize: "vertical" }}
              />
            </label>
          </div>
          <footer className="dialog-f">
            <button type="button" className="btn ghost" onClick={onClose} disabled={isPending}>Batal</button>
            <button type="submit" className="btn" style={{ background: "#d97706", color: "#fff" }} disabled={!reason.trim() || isPending}>
              <PauseCircle size={14} style={{ marginRight: 6 }} /> Simpan Status Hold
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

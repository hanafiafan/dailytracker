import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, BellRing, Bookmark, MoreHorizontal, CheckCircle2, Copy, ListChecks, MessageSquare, Pencil, Sparkles, Undo2, UserRound, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadTemplates, saveTemplates } from "../lib/templates";
import { PRIORITIES, type ActivityDTO, type TaskDTO } from "@shared/schemas";
import { useTaskActions } from "../lib/actions";
import { NEXT, STATUS, fmtShort, fmtTime, host } from "../lib/format";
import { patchTaskLocally, useMeta, useProjectServices, useTask, useTaskActivity } from "../lib/queries";
import { PRIORITY_LABEL, WARN_OPTIONS } from "../lib/tasks";
import { useUi, useViewer } from "../lib/viewer";
import { TaskTimer } from "./TimeTracker";
import { ProofPanel } from "./ProofPanel";
import { TimeTags } from "./TaskTags";
import { Avatar, ConfirmButton } from "./ui";
import { Sheet } from "./Sheet";
import { useIsMobile } from "../lib/useMedia";

const ICON: Record<string, ReactNode> = { created: <Sparkles size={14} />, status: <CheckCircle2 size={14} />, edited: <Pencil size={14} />, assigned: <UserRound size={14} />, returned: <Undo2 size={14} />, comment: <MessageSquare size={14} />, subtask: <ListChecks size={14} /> };

export function TaskDrawer({ id }: { id: string }) {
  const { closeTask } = useUi();
  const q = useTask(id), act = useTaskActivity(id), meta = useMeta(true);
  const t = q.data;
  useEffect(() => { const on = (e: KeyboardEvent) => e.key === "Escape" && closeTask(); window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [closeTask]);
  return (
    <>
      <div className="scrim" onClick={closeTask} />
      <div className="drawer" role="dialog" aria-label="Detail tugas">
        {!t ? <div className="drawer-h"><h2>{q.isError ? "Tugas tidak ditemukan" : "Memuat…"}</h2><button className="iconbtn" onClick={closeTask} aria-label="Tutup"><X size={18} /></button></div>
          : <DrawerBody t={t} key={t.id} activity={act.data ?? []} owner={meta.data?.owner ?? { name: "Superadmin", email: "" }} />}
      </div>
    </>
  );
}

function DrawerBody({ t, activity, owner }: { t: TaskDTO; activity: ActivityDTO[]; owner: { name: string; email: string } }) {
  const { me, team, policy, projects, labels, member } = useViewer();
  const { closeTask, newTask } = useUi();
  const a = useTaskActions(t);
  const servicesQ = useProjectServices(t.projectId ?? "");
  const qc = useQueryClient();
  const [proofOpen, setProofOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const mobile = useIsMobile(), [more, setMore] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [sub, setSub] = useState("");
  const isPending = t.approvalStatus === "pending";
  const canApprove = isPending && policy.canApproveTask(t.email);
  const canEdit = policy.canManage(t.email) || (me.email === t.email && !!me.member && t.by === "self");
  const manager = policy.canManage(t.email);
  const work = (manager || (me.email === t.email && !!me.member)) && !isPending;
  const who = member(t.email);
  const people = team.filter(m => !m.isAdmin && policy.canManage(m.email));
  const done = t.subtasks.filter(s => s.done).length;
  const photo = t.hasPhoto ? `/api/tasks/${t.id}/proof` : null;
  const cycle = () => {
    if (isPending) return void toast.error("Tugas belum disetujui atasan.");
    const next = NEXT[t.status];
    if (next === "done" && (t.needProof || t.email === me.email || !manager)) return setProofOpen(true);
    a.setStatus.mutate(next);
  };
  const onBlur = (field: "title" | "note") => (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const v = e.target.value.trim();
    if (field === "title" && !v) { e.target.value = t.title; return; }
    if (v !== t[field]) a.patch.mutate({ [field]: v });
  };
  return (
    <>
      <div className="drawer-h">
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <div><button className={"status " + (isPending ? "pending" : t.status)} onClick={cycle} disabled={!work && !isPending} title={isPending ? "Menunggu persetujuan atasan" : undefined} aria-label={`Status: ${isPending ? "Menunggu" : STATUS[t.status]}. Ketuk untuk ganti.`}>{isPending ? "Menunggu" : STATUS[t.status]}</button></div>
          {canEdit
            ? <textarea className="input titlefield" rows={2} defaultValue={t.title} maxLength={120} onBlur={onBlur("title")} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Judul tugas" />
            : <h2>{t.title}</h2>}
          <div className="meta"><TimeTags t={t} />{t.routineId && <span className="tag rut">Rutin</span>}{t.by === "self" && <span className="tag off">Buatan sendiri</span>}{t.fromAdmin && <span className="tag off" title={"Dari " + t.fromAdmin}>Dari {t.fromAdmin}</span>}</div>
        </div>
        <button className="iconbtn" onClick={closeTask} aria-label="Tutup"><X size={18} /></button>
      </div>
      <div className="drawer-b">
        {isPending && (
          <div className="surface" style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "grid", gap: 2 }}>
              <b style={{ color: "#d97706", fontSize: 13 }}>Menunggu persetujuan atasan</b>
              <small className="muted">{canApprove ? "Tugas mandiri ini memerlukan keputusan persetujuanmu sebelum bisa dikerjakan." : "Tugas ini belum disetujui atasan sehingga belum bisa dimulai."}</small>
            </div>
            {canApprove && (
              <div className="chips" style={{ flexWrap: "nowrap" }}>
                <button className="btn small primary" disabled={a.approve.isPending} onClick={() => a.approve.mutate("approved")}>Setujui</button>
                <button className="btn small" disabled={a.approve.isPending} onClick={() => a.approve.mutate("rejected")}>Tolak</button>
              </div>
            )}
          </div>
        )}
        {t.approvalStatus === "rejected" && (
          <div className="surface" style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, padding: "10px 14px", display: "grid", gap: 2 }}>
            <b style={{ color: "#dc2626", fontSize: 13 }}>Tugas mandiri ini ditolak</b>
            <small className="muted">{t.approvedBy ? `Ditolak oleh ${t.approvedBy}` : "Ditolak oleh atasan"}. Kamu bisa menghapus tugas ini.</small>
          </div>
        )}
        {t.returnedAt && t.status !== "done" && (
          <div className="surface" style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 10, padding: "10px 14px", display: "grid", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--bad)", fontWeight: 700, fontSize: "0.85rem" }}>
              <Undo2 size={14} />
              <span>Perlu Perbaikan / Revisi {t.revisions > 1 ? `(Revisi ke-${t.revisions})` : ""}</span>
            </div>
            {t.revisionNote ? (
              <p style={{ margin: "2px 0 0", fontSize: "0.86rem", whiteSpace: "pre-wrap", color: "var(--ink)", lineHeight: 1.45 }}>
                <b>Catatan Revisi:</b> {t.revisionNote}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Tugas ini dikembalikan oleh atasan untuk diperbaiki.
              </p>
            )}
          </div>
        )}
        <section className="props">
          <span>Ditugaskan</span>
          {manager && people.length > 1
            ? <select className="input" aria-label="Ditugaskan ke" value={t.email} onChange={e => a.patch.mutate({ email: e.target.value })}>{people.concat(who && !people.some(p => p.email === who.email) ? [who] : []).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}</select>
            : <div className="chips">{who && <Avatar m={who} />}<b>{who?.name ?? t.email}</b></div>}
          <span>Tanggal</span>
          {canEdit ? <input className="input" aria-label="Tanggal" type="date" defaultValue={t.date} onBlur={e => e.target.value && e.target.value !== t.date && a.patch.mutate({ date: e.target.value })} /> : <b>{fmtShort(t.date)}</b>}
          <span>Jam kerja</span>
          {canEdit
            ? <div className="row" style={{ gap: 8 }}>
                <input className="input timein" type="time" defaultValue={t.start ?? ""} aria-label="Mulai" onBlur={e => (e.target.value || null) !== t.start && a.patch.mutate({ start: e.target.value || null })} />
                <span>–</span>
                <input className="input timein" type="time" defaultValue={t.due ?? ""} aria-label="Selesai" onBlur={e => (e.target.value || null) !== t.due && a.patch.mutate({ due: e.target.value || null })} />
              </div>
            : <b>{t.start || t.due ? `${t.start ?? "…"} – ${t.due ?? "…"}` : "Tanpa jam"}</b>}
          <span>Prioritas</span>
          {canEdit
            ? <div className="chips">{PRIORITIES.map(p => <button key={p} className="chip" aria-pressed={t.priority === p} onClick={() => a.patch.mutate({ priority: p })}>{PRIORITY_LABEL[p]}</button>)}</div>
            : <span className={"tag " + t.priority} style={{ justifySelf: "start" }}>{PRIORITY_LABEL[t.priority]}</span>}
          <span>Proyek</span>
          {canEdit
            ? <select className="input" aria-label="Proyek" value={t.projectId ?? ""} onChange={e => a.patch.mutate({ projectId: e.target.value || null, serviceId: null })}><option value="">Tanpa proyek</option>{projects.filter(p => !p.archived || p.id === t.projectId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            : <b>{projects.find(p => p.id === t.projectId)?.name ?? "—"}</b>}
          {t.projectId && (
            <>
              <span>Layanan</span>
              {canEdit ? (
                <select className="input" aria-label="Layanan" value={t.serviceId ?? ""} onChange={e => a.patch.mutate({ serviceId: e.target.value || null })}>
                  <option value="">Tanpa layanan spesifik</option>
                  {(servicesQ.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <b>{(servicesQ.data ?? []).find(s => s.id === t.serviceId)?.name ?? "—"}</b>
              )}
            </>
          )}
          <span>Label</span>
          <div className="chips">
            {labels.length === 0 && <span className="muted">Belum ada label</span>}
            {labels.map(l => {
              const on = t.labelIds.includes(l.id);
              return canEdit || on ? <button key={l.id} className="chip" data-c={l.color} aria-pressed={on} disabled={!canEdit} onClick={() => a.patch.mutate({ labelIds: on ? t.labelIds.filter(x => x !== l.id) : [...t.labelIds, l.id] })}><i className="sw" />{l.name}</button> : null;
            })}
          </div>
          {manager && t.due && t.status !== "done" && <><span>Peringatan</span><select className="input" value={t.warnMin ?? 30} onChange={e => a.patch.mutate({ warnMin: Number(e.target.value) })}>{WARN_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l} sebelum tenggat</option>)}</select></>}
          {manager && <><span>Wajib bukti</span><label className="check"><input type="checkbox" checked={t.needProof} onChange={e => a.patch.mutate({ needProof: e.target.checked })} />Karyawan harus melampirkan bukti</label></>}
        </section>

        <section>
          <span className="lbl">Deskripsi</span>
          {canEdit ? <textarea className="input" defaultValue={t.note} rows={3} maxLength={600} placeholder="Detail, link brief, atau target" onBlur={onBlur("note")} /> : <p>{t.note || <span className="muted">Tidak ada deskripsi.</span>}</p>}
        </section>

        <TaskTimer t={t} canWork={work} />

        <section>
          <span className="lbl">Checklist{t.subtasks.length > 0 && ` · ${done}/${t.subtasks.length}`}</span>
          {t.subtasks.length > 0 && <div className="stackbar"><i className="s-done" style={{ width: `${(done / t.subtasks.length) * 100}%` }} /></div>}
          {t.subtasks.map(s => (
            <label key={s.id} className={"check-row" + (s.done ? " done" : "")}>
              <input type="checkbox" key={s.id + s.done} defaultChecked={s.done} disabled={!work} onChange={e => { patchTaskLocally(qc, t.id, { subtasks: t.subtasks.map(x => x.id === s.id ? { ...x, done: e.target.checked } : x) }); a.toggleSubtask.mutate({ sid: s.id, done: e.target.checked }); }} />
              <span>{s.title}</span>
              {work && <button type="button" className="del" aria-label={"Hapus " + s.title} onClick={() => a.removeSubtask.mutate(s.id)}>✕</button>}
            </label>
          ))}
          {work && <form className="quick" onSubmit={e => { e.preventDefault(); if (sub.trim()) a.addSubtask.mutate(sub.trim(), { onSuccess: () => setSub("") }); }}>
            <input className="input" value={sub} onChange={e => setSub(e.target.value)} placeholder="Tambah langkah…" maxLength={160} style={{ flex: 1 }} /><button className="btn small" type="submit">Tambah</button>
          </form>}
        </section>

        <section>
          <span className="lbl">Bukti dan catatan</span>
          {t.proofAt && (
            <div className="proof">
              {photo && <button className="thumb" style={{ width: 84, height: 84 }} onClick={() => setLightbox(true)} aria-label="Lihat foto bukti"><img src={photo} alt={"Bukti: " + t.title} /></button>}
              <div className="pmeta"><span>Bukti · {fmtTime(t.proofAt)}</span>{t.proofLink && <a href={t.proofLink} target="_blank" rel="noopener noreferrer">{host(t.proofLink)}</a>}</div>
            </div>
          )}
          {!t.proofAt && t.status === "done" && <p className="muted">Selesai tanpa bukti.</p>}
          {work && <textarea className="input" rows={2} maxLength={600} defaultValue={t.report ?? ""} placeholder="Catatan progres, kendala, atau link hasil kerja" aria-label="Catatan" onBlur={e => e.target.value.trim() !== (t.report ?? "") && a.saveReport.mutate(e.target.value.trim())} />}
          {!work && t.report && <div className="report"><p>{t.report}</p></div>}
          {proofOpen && <ProofPanel t={t} onClose={() => setProofOpen(false)} />}
        </section>

        <section className="timeline">
          <span className="lbl">Aktivitas</span>
          <ul>{activity.map(x => (
            <li key={x.id}><span className="tl-ic">{ICON[x.kind] ?? <Pencil size={14} />}</span><div><b>{x.actorName}</b> {x.text}<small>{new Date(x.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></li>
          ))}</ul>
        </section>
      </div>
      <footer className="drawer-f">
        {canApprove && (
          <>
            <button className="btn primary" disabled={a.approve.isPending} onClick={() => a.approve.mutate("approved")}>Setujui tugas</button>
            <button className="btn" disabled={a.approve.isPending} onClick={() => a.approve.mutate("rejected")}>Tolak tugas</button>
          </>
        )}
        {work && t.status !== "done" && !proofOpen && <button className="btn primary" onClick={() => (t.needProof || t.email === me.email || !manager ? setProofOpen(true) : a.setStatus.mutate("done"))}>Tandai selesai</button>}
        {mobile ? <><button className="btn" onClick={() => setMore(true)}><MoreHorizontal size={16} />Lainnya</button>
          <Sheet open={more} onClose={() => setMore(false)} title="Aksi tugas"><div className="alist sheetacts" onClick={() => setMore(false)}>
        {manager && t.status !== "done" && t.email !== me.email && <button className="btn" onClick={() => a.nudge.mutate()} disabled={a.nudge.isPending}><BellRing size={14} />Ingatkan</button>}
        {manager && t.status === "done" && t.by !== "self" && (
          <button type="button" className="btn" onClick={() => { setMore(false); setReturnOpen(true); }}>
            <Undo2 size={14} style={{ marginRight: 6 }} />Kembalikan untuk diperbaiki
          </button>
        )}
        {(manager || me.member) && <button className="btn" onClick={() => { newTask({ emails: [t.email], title: t.title.slice(0, 108) + " (salinan)", note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }); closeTask(); }}><Copy size={14} />Duplikat</button>}
        <button className="btn" onClick={() => { saveTemplates([{ title: t.title, note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }, ...loadTemplates().filter(x => x.title !== t.title)]); toast.success("Disimpan sebagai templat"); }}><Bookmark size={14} />Simpan templat</button>
        {canEdit && <ConfirmButton className="btn danger" label="Hapus tugas" armed="Yakin hapus?" onConfirm={() => a.remove.mutate(undefined, { onSuccess: closeTask })} />}
          </div></Sheet></> : <>
        {manager && t.status !== "done" && t.email !== me.email && <button className="btn" onClick={() => a.nudge.mutate()} disabled={a.nudge.isPending}><BellRing size={14} />Ingatkan</button>}
        {manager && t.status === "done" && t.by !== "self" && (
          <button type="button" className="btn" onClick={() => setReturnOpen(true)}>
            <Undo2 size={14} style={{ marginRight: 6 }} />Kembalikan untuk diperbaiki
          </button>
        )}
        {(manager || me.member) && <button className="btn" onClick={() => { newTask({ emails: [t.email], title: t.title.slice(0, 108) + " (salinan)", note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }); closeTask(); }}><Copy size={14} />Duplikat</button>}
        <button className="btn" onClick={() => { saveTemplates([{ title: t.title, note: t.note, priority: t.priority, projectId: t.projectId ?? undefined, labelIds: t.labelIds, steps: t.subtasks.map(s => s.title), start: t.start ?? undefined, due: t.due ?? undefined }, ...loadTemplates().filter(x => x.title !== t.title)]); toast.success("Disimpan sebagai templat"); }}><Bookmark size={14} />Simpan templat</button>
        {canEdit && <ConfirmButton className="btn danger" label="Hapus tugas" armed="Yakin hapus?" onConfirm={() => a.remove.mutate(undefined, { onSuccess: closeTask })} />}
        </>}
      </footer>
      {lightbox && photo && <div className="lightbox" role="dialog" onClick={() => setLightbox(false)}><img src={photo} alt="Foto bukti" /><button className="iconbtn" aria-label="Tutup"><X size={18} /></button></div>}
      {returnOpen && (
        <ReturnTaskModal
          taskTitle={t.title}
          onClose={() => setReturnOpen(false)}
          onSubmit={reason => {
            a.giveBack.mutate(reason, {
              onSuccess: () => setReturnOpen(false),
            });
          }}
          isPending={a.giveBack.isPending}
        />
      )}
    </>
  );
}

export function ReturnTaskModal({
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
    const clean = reason.trim();
    if (!clean) {
      toast.error("Deskripsi apa saja yang perlu direvisi wajib diisi!");
      return;
    }
    onSubmit(clean);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Kembalikan untuk Direvisi" style={{ maxWidth: 460 }}>
        <div className="dialog-h">
          <div>
            <h2>Kembalikan untuk Direvisi</h2>
            <p className="muted clamp1">{taskTitle}</p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-b" style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 10, padding: "10px 12px", fontSize: "0.82rem", color: "var(--ink)", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertCircle size={16} style={{ color: "var(--bad)", flexShrink: 0, marginTop: 2 }} />
              <div>
                Status tugas akan dikembalikan ke <b>Dikerjakan</b>. Wajib tuliskan rincian apa saja yang harus diperbaiki oleh staf.
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span className="lbl" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Deskripsi yang Perlu Direvisi <b style={{ color: "var(--bad)" }}>*</b></span>
                <small className="muted">{reason.length}/1000</small>
              </span>
              <textarea
                className="input"
                rows={4}
                maxLength={1000}
                required
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Tuliskan dengan jelas apa saja yang perlu diperbaiki, kekurangan laporan/bukti, dll..."
                autoFocus
                style={{ resize: "vertical" }}
              />
            </label>
          </div>
          <footer className="dialog-f">
            <button type="button" className="btn ghost" onClick={onClose} disabled={isPending}>Batal</button>
            <button type="submit" className="btn danger" disabled={!reason.trim() || isPending}>
              <Undo2 size={14} style={{ marginRight: 6 }} /> Kembalikan Tugas
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

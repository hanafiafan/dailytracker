import { useState } from "react";
import {
  BarChart2, CheckCircle2, Circle, Clock, ExternalLink, Pin, PinOff,
  Plus, Trash2, Users, X, CheckSquare, Crown, ShieldCheck, ArrowRight,
  FolderKanban, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { MessageDTO, PollDTO, Priority, TaskRefDetailDTO, ProjectRefDetailDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { keys, useAction } from "../lib/queries";
import { useViewer, useUi } from "../lib/viewer";
import { Avatar } from "./ui";
import { today, fmtTime } from "../lib/format";
import { PRIORITY_LABEL } from "../lib/tasks";

/** Lark-style interactive Task Card inside chat message */
export function ChatTaskCard({
  detail,
  onOpen,
}: {
  detail: TaskRefDetailDTO;
  onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(detail.status);
  const isDone = status === "done";

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = isDone ? "todo" : "done";
    setStatus(nextStatus);
    try {
      await ok(api.tasks[":id"].status.$patch({ param: { id: detail.id }, json: { status: nextStatus } }));
      await qc.invalidateQueries({ queryKey: keys.tasks });
      toast.success(nextStatus === "done" ? "Tugas selesai! 🎉" : "Status diubah ke todo");
    } catch {
      setStatus(detail.status);
      toast.error("Gagal mengubah status tugas");
    }
  };

  const isOverdue = !isDone && detail.due && detail.due < today();

  return (
    <div className="chat-task-card" onClick={() => onOpen(detail.id)} style={{ cursor: "pointer" }}>
      <div className="chat-task-card-h">
        <button
          type="button"
          className={"chat-task-check" + (isDone ? " done" : "")}
          onClick={toggleStatus}
          title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
        >
          {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Tugas Terintegrasi
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".76rem", color: "var(--blue)" }}>
              Detail <ExternalLink size={12} />
            </span>
          </div>
          <b style={{ display: "block", fontSize: ".92rem", textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.7 : 1 }}>
            {detail.title}
          </b>
        </div>
      </div>

      <div className="chat-task-meta">
        {detail.projectName && (
          <span className="tag proj" data-c={detail.projectColor} style={{ fontSize: ".72rem", padding: "1px 7px" }}>
            <FolderKanban size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
            {detail.projectName}
          </span>
        )}
        <span className={`tag ${detail.priority === "urgent" ? "due" : detail.priority === "high" ? "wait" : ""}`} style={{ fontSize: ".72rem" }}>
          {PRIORITY_LABEL[detail.priority as Priority] || detail.priority}
        </span>
        {detail.due && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: isOverdue ? "var(--bad)" : "var(--muted)", fontWeight: isOverdue ? 700 : 500 }}>
            <Clock size={12} />
            {isOverdue ? `Terlewat (${detail.due})` : detail.due}
          </span>
        )}
        {detail.assigneeName && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto", color: "var(--ink)", fontWeight: 600 }}>
            {detail.assigneeName}
          </span>
        )}
      </div>
    </div>
  );
}

/** Lark-style interactive Project Card inside chat message */
export function ChatProjectCard({
  detail,
  onOpen,
}: {
  detail: ProjectRefDetailDTO;
  onOpen: (id: string) => void;
}) {
  const percent = detail.totalTasks && detail.totalTasks > 0
    ? Math.round(((detail.doneTasks || 0) / detail.totalTasks) * 100)
    : 0;

  return (
    <div className="chat-task-card chat-project-card" onClick={() => onOpen(detail.id)} style={{ cursor: "pointer" }}>
      <div className="chat-task-card-h">
        <div
          className="chat-proj-icon"
          data-c={detail.color}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <FolderKanban size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Proyek Terintegrasi
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: ".76rem", color: "var(--blue)" }}>
              Buka <ExternalLink size={12} />
            </span>
          </div>
          <b style={{ display: "block", fontSize: ".92rem", marginTop: 2 }}>
            {detail.name}
          </b>
          {detail.description && (
            <p className="clamp1 muted" style={{ fontSize: ".78rem", margin: "2px 0 0" }}>
              {detail.description}
            </p>
          )}
        </div>
      </div>

      <div className="chat-task-meta" style={{ alignItems: "center" }}>
        <span className={`tag ${detail.archived ? "" : "done"}`} style={{ fontSize: ".72rem" }}>
          {detail.archived ? "Diarsipkan" : "Aktif"}
        </span>

        {detail.totalTasks !== undefined && detail.totalTasks > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 120, maxWidth: 200 }}>
            <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: "var(--volt)", borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: ".72rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {detail.doneTasks}/{detail.totalTasks} ({percent}%)
            </span>
          </div>
        ) : (
          <span style={{ fontSize: ".74rem", color: "var(--muted)" }}>
            Belum ada tugas
          </span>
        )}

        <span className="tag proj" data-c={detail.color} style={{ fontSize: ".72rem", marginLeft: "auto" }}>
          #{detail.name}
        </span>
      </div>
    </div>
  );
}

/** Interactive Poll Card in Chat */
export function ChatPollCard({
  poll,
  canManage,
}: {
  poll: PollDTO;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [voting, setVoting] = useState(false);

  const voteAction = useAction(async (optionIndex: number) => {
    if (poll.isClosed) return;
    setVoting(true);
    try {
      await ok(api.chat.polls[":id"].vote.$post({ param: { id: poll.id }, json: { optionIndex } }));
      await qc.invalidateQueries({ queryKey: keys.chat });
    } finally {
      setVoting(false);
    }
  });

  const toggleClose = useAction(async () => {
    await ok(api.chat.polls[":id"].close.$post({ param: { id: poll.id } }));
    await qc.invalidateQueries({ queryKey: keys.chat });
    toast.success(poll.isClosed ? "Polling dibuka kembali" : "Polling ditutup");
  });

  const total = poll.totalVotes || 0;

  return (
    <div className="chat-poll-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="poll-badge">
          <BarChart2 size={12} /> {poll.isClosed ? "Polling Ditutup" : "Polling"}
        </span>
        <small className="muted" style={{ fontSize: ".74rem" }}>
          oleh {poll.creatorName}
        </small>
      </div>

      <h3 style={{ fontSize: ".98rem", fontWeight: 700, margin: "2px 0 8px" }}>
        {poll.question}
      </h3>

      {poll.allowMultiple && (
        <p className="muted" style={{ fontSize: ".76rem", margin: "0 0 8px" }}>
          Pilihan ganda diizinkan
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {poll.options.map(opt => {
          const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
          return (
            <button
              key={opt.index}
              type="button"
              className={"poll-option-btn" + (opt.hasVoted ? " voted" : "")}
              disabled={poll.isClosed || voting}
              onClick={() => voteAction.mutate(opt.index)}
              title={opt.voterNames.length ? `Pemilih: ${opt.voterNames.join(", ")}` : "Belum ada suara"}
            >
              <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, zIndex: 1 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: poll.allowMultiple ? 4 : "50%",
                    border: "2px solid " + (opt.hasVoted ? "var(--blue)" : "var(--muted)"),
                    background: opt.hasVoted ? "var(--blue)" : "none",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 10,
                  }}
                >
                  {opt.hasVoted && "✓"}
                </span>
                <span style={{ fontWeight: opt.hasVoted ? 700 : 500 }}>{opt.text}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, zIndex: 1, fontSize: ".82rem" }}>
                <span className="muted">{opt.count} suara</span>
                <b style={{ minWidth: 32, textAlign: "right" }}>{pct}%</b>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
        <span className="muted" style={{ fontSize: ".78rem" }}>
          Total {poll.totalVoters} pemilih ({total} suara)
        </span>
        {canManage && (
          <button
            type="button"
            className="btn small ghost"
            style={{ fontSize: ".74rem", height: 26, padding: "0 8px" }}
            onClick={() => toggleClose.mutate()}
          >
            {poll.isClosed ? "Buka Kembali" : "Tutup Polling"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Modal to create a new poll */
export function CreatePollModal({
  channel,
  onClose,
}: {
  channel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAddOption = () => {
    if (options.length < 10) setOptions(o => [...o, ""]);
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length > 2) setOptions(o => o.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, val: string) => {
    setOptions(o => o.map((v, i) => (i === idx ? val : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = question.trim();
    const cleanOpts = options.map(o => o.trim()).filter(Boolean);
    if (!cleanQ) return void toast.error("Pertanyaan polling harus diisi");
    if (cleanOpts.length < 2) return void toast.error("Minimal harus ada 2 opsi pilihan");

    setBusy(true);
    try {
      await ok(api.chat.channels[":id"].polls.$post({
        param: { id: channel },
        json: {
          question: cleanQ,
          options: cleanOpts,
          allowMultiple,
        },
      }));
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Polling berhasil dibuat!");
      onClose();
    } catch {
      toast.error("Gagal membuat polling");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Buat Polling">
        <div className="dialog-h">
          <div>
            <h2>Buat Polling Diskusi</h2>
            <p className="muted">Kumpulkan pendapat atau voting anggota di channel ini.</p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="field">
              <span>Pertanyaan</span>
              <input
                className="input"
                placeholder="misal: Jam berapa jadwal meeting besok?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--ink)" }}>Pilihan Opsi</span>
              {options.map((opt, idx) => (
                <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className="input"
                    placeholder={`Opsi ${idx + 1}`}
                    value={opt}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    maxLength={100}
                    required
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => handleRemoveOption(idx)}
                      title="Hapus opsi"
                      style={{ color: "var(--bad)" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={handleAddOption}
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                >
                  <Plus size={14} /> Tambah Opsi
                </button>
              )}
            </div>

            <label className="check" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={e => setAllowMultiple(e.target.checked)}
              />
              <span>Izinkan memilih lebih dari satu opsi (Multiple Choice)</span>
            </label>
          </div>
          <footer className="dialog-f">
            <button type="submit" className="btn primary" disabled={busy}>Kirim Polling</button>
            <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          </footer>
        </form>
      </div>
    </>
  );
}

/** Modal to convert chat message into a task (Lark-style) */
export function ConvertMessageToTaskModal({
  message,
  channel,
  onClose,
}: {
  message: MessageDTO;
  channel: string;
  onClose: () => void;
}) {
  const { team, projects, me } = useViewer();
  const qc = useQueryClient();

  const defaultTitle = message.text.split("\n")[0]?.slice(0, 100) || "Tugas dari chat";
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState(`Dibuat dari chat (${message.name}):\n"${message.text}"`);
  const [assigneeEmail, setAssigneeEmail] = useState(me.email);
  const [projectId, setProjectId] = useState<string>(channel.startsWith("p-") ? channel.slice(2) : "");
  const [dueDate, setDueDate] = useState(today());
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return void toast.error("Judul tugas harus diisi");

    setBusy(true);
    try {
      // 1. Create task
      const res = await ok(api.tasks.$post({
        json: {
          title: title.trim(),
          note: note.trim(),
          emails: [assigneeEmail].filter(Boolean),
          date: dueDate,
          due: dueDate,
          priority,
          projectId: projectId || null,
          hot: priority === "urgent",
          needProof: true,
        },
      }));

      const createdId = res.ids?.[0];
      if (createdId) {
        // 2. Post a confirmation message with task reference to the channel
        await ok(api.chat.channels[":id"].messages.$post({
          param: { id: channel },
          json: {
            text: `📋 Mengubah pesan menjadi tugas: [[0]]`,
            refs: [{ type: "task", id: createdId }],
            attachmentIds: [],
          },
        }));
      }

      await qc.invalidateQueries({ queryKey: keys.tasks });
      await qc.invalidateQueries({ queryKey: keys.chat });

      toast.success("Tugas berhasil dibuat & ditautkan ke chat!");
      onClose();
    } catch {
      toast.error("Gagal membuat tugas dari pesan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Jadikan Tugas">
        <div className="dialog-h">
          <div>
            <h2>Jadikan Tugas</h2>
            <p className="muted">Ubah pesan chat ini langsung menjadi kartu tugas di sistem task tracker.</p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="field">
              <span>Judul Tugas</span>
              <input
                className="input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </label>

            <div className="row" style={{ gap: 12 }}>
              <label className="field" style={{ flex: "1 1 180px" }}>
                <span>Penerima Tugas</span>
                <select
                  className="input"
                  value={assigneeEmail}
                  onChange={e => setAssigneeEmail(e.target.value)}
                >
                  {team.map(m => (
                    <option key={m.email} value={m.email}>
                      {m.name} ({m.role || m.group || "Anggota"})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ flex: "1 1 180px" }}>
                <span>Proyek</span>
                <select
                  className="input"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                >
                  <option value="">(Tanpa Proyek)</option>
                  {projects.filter(p => !p.archived).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="row" style={{ gap: 12 }}>
              <label className="field" style={{ flex: "1 1 180px" }}>
                <span>Tenggat Waktu</span>
                <input
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  required
                />
              </label>

              <label className="field" style={{ flex: "1 1 180px" }}>
                <span>Prioritas</span>
                <select
                  className="input"
                  value={priority}
                  onChange={e => setPriority(e.target.value as Priority)}
                >
                  <option value="normal">Normal</option>
                  <option value="high">Tinggi</option>
                  <option value="urgent">Mendesak</option>
                  <option value="low">Rendah</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Catatan / Detail Tambahan</span>
              <textarea
                className="input"
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={400}
              />
            </label>
          </div>
          <footer className="dialog-f">
            <button type="submit" className="btn primary" disabled={busy}>
              <CheckSquare size={15} style={{ marginRight: 6 }} /> Buat Tugas Sekarang
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          </footer>
        </form>
      </div>
    </>
  );
}

/** Pinned Bar displaying pinned message at top of chat */
export function PinnedBar({
  pinnedMessages,
  onJumpTo,
  onUnpin,
}: {
  pinnedMessages: MessageDTO[];
  onJumpTo: (id: string) => void;
  onUnpin: (id: string) => void;
}) {
  if (!pinnedMessages.length) return null;
  const latest = pinnedMessages[pinnedMessages.length - 1]!;
  const snippet = latest.text || (latest.attachments.length ? "Lampiran berkas" : "Pesan disematkan");

  return (
    <div className="pinned-bar" onClick={() => onJumpTo(latest.id)}>
      <Pin size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <b style={{ fontSize: ".76rem", color: "var(--ink)", flexShrink: 0 }}>
          Disematkan{pinnedMessages.length > 1 ? ` (${pinnedMessages.length})` : ""}:
        </b>
        <span className="clamp1 muted" style={{ fontSize: ".82rem" }}>
          <b style={{ color: "var(--ink)" }}>{latest.name}:</b> {snippet}
        </span>
      </div>
      <button
        type="button"
        className="iconbtn"
        style={{ padding: 4, width: 24, height: 24 }}
        title="Lepas sematan"
        onClick={e => {
          e.stopPropagation();
          onUnpin(latest.id);
        }}
      >
        <PinOff size={13} />
      </button>
    </div>
  );
}

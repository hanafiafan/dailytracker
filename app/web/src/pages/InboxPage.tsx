import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  CheckSquare,
  Copy,
  Crown,
  Download,
  FileText,
  Hash,
  Info,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ChannelDTO, ChatRefDTO, MessageDTO } from "@shared/schemas";
import { isBOMember, isDirectorMember } from "@shared/policy";
import { ChatComposer } from "../components/ChatComposer";
import { Page } from "../components/Page";
import { Avatar, ConfirmButton, Empty } from "../components/ui";
import { GroupDialog } from "../components/GroupDialog";
import { ChatTaskCard, ChatPollCard, ConvertMessageToTaskModal, PinnedBar } from "../components/ChatFeatures";
import { api, ok, putImage } from "../lib/api";
import { fmtTime } from "../lib/format";
import { squarePhoto } from "../lib/image";
import { keys, useAction, useChannels, useInbox, useMessages, useMeta } from "../lib/queries";
import { useIsMobile } from "../lib/useMedia";
import { useUi, useViewer } from "../lib/viewer";

const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt` : m < 1440 ? `${Math.floor(m / 60)} jam` : `${Math.floor(m / 1440)} hr`; };
const dayLabel = (ms: number) => { const d = new Date(ms), n = new Date(), y = new Date(Date.now() - 864e5); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); return same(d, n) ? "Hari ini" : same(d, y) ? "Kemarin" : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(d); };
const bytes = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

function useAllTeam() {
  const { team } = useViewer();
  const meta = useMeta(true);
  const owner = meta.data?.owner;
  return useMemo(() => {
    if (!owner || team.some(m => m.email.toLowerCase() === owner.email.toLowerCase())) return team;
    return [...team, {
      email: owner.email,
      name: owner.name || "Superadmin",
      role: "Superadmin",
      group: "",
      isAdmin: true,
      adminGroups: [],
      sortOrder: 0,
      hasPhoto: false,
      photoV: 0,
      seenAt: null,
      askAt: null,
      managerEmail: null,
      jobdesk: "",
      level: "superadmin",
      accountType: "employee" as const,
      canCreateProject: true,
      canCommentAllProjects: true,
      allowedCommentProjectIds: [],
    }];
  }, [team, owner]);
}

/** Message text with its [[n]] placeholders turned into clickable chips (person, task, project). */
function Body({ m }: { m: MessageDTO }) {
  const { openTask } = useUi();
  const { me, policy } = useViewer();
  const [, go] = useLocation();
  const parts = m.text.split(/(\[\[\d+\]\])/g);
  const chip = (r: ChatRefDTO) => r.type === "member" ? <span key={r.id} className="rchip mem">@{r.label}</span>
    : r.type === "project" ? <button key={r.id} className="rchip proj" onClick={() => go("/proyek/" + r.id)}><Hash size={12} />{r.label}</button>
    : r.ok ? <button key={r.id} className="rchip task" onClick={() => openTask(r.id)}><FileText size={12} />{r.label}</button> : <span key={r.id} className="rchip off" title="Kamu tidak punya akses ke tugas ini"><FileText size={12} />Tugas pribadi</span>;

  // Integrated task details for Lark-style task cards
  const taskCards = m.refs.filter(r => r.type === "task" && r.taskDetails);

  return (
    <>
      <p className="mtext">{parts.map((p, i) => { const k = /^\[\[(\d+)\]\]$/.exec(p); const r = k ? m.refs[Number(k[1])] : undefined; return r ? <Fragment key={i}>{chip(r)}</Fragment> : <Fragment key={i}>{p}</Fragment>; })}</p>
      {taskCards.map(r => (
        <ChatTaskCard key={r.id} detail={r.taskDetails!} onOpen={openTask} />
      ))}
      {m.poll && (
        <ChatPollCard
          poll={m.poll}
          canManage={m.email === me.email || policy.isAdmin || policy.isSuper || policy.isBoss}
        />
      )}
    </>
  );
}

const ChIcon = ({ c }: { c: ChannelDTO }) =>
  c.kind === "general" ? <MessageSquare size={16} /> :
  c.kind === "group" ? <Users size={16} /> :
  c.kind === "dm" ? <MessageCircle size={16} /> :
  <Hash size={16} />;

function AddMemberModal({
  currentMembers,
  onClose,
  onAdd,
}: {
  currentMembers: string[];
  onClose: () => void;
  onAdd: (newEmails: string[]) => Promise<void>;
}) {
  const allTeam = useAllTeam();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const available = allTeam.filter(
    m => !currentMembers.some(e => e.toLowerCase() === m.email.toLowerCase()) &&
      (!q.trim() || `${m.name} ${m.role} ${m.group}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  const toggle = (email: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await onAdd([...selected]);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Tambah Anggota">
        <div className="dialog-h">
          <div>
            <h2>Tambah Anggota</h2>
            <p className="muted">Pilih anggota tim untuk ditambahkan ke grup ini.</p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button>
        </div>
        <div className="dialog-b">
          <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau jabatan..." autoFocus />
          <div style={{ maxHeight: 280, overflow: "auto", display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {available.map(m => {
              const on = selected.has(m.email);
              return (
                <button
                  key={m.email}
                  type="button"
                  className={"menuitem" + (on ? " on" : "")}
                  style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", background: on ? "var(--canvas)" : undefined }}
                  onClick={() => toggle(m.email)}
                >
                  <Avatar m={m} />
                  <div style={{ textAlign: "left", marginLeft: 10, flex: 1 }}>
                    <b style={{ display: "block" }}>{m.name}</b>
                    <small className="muted">{m.role || "Anggota Tim"}{m.group ? ` · ${m.group}` : ""}</small>
                  </div>
                  <input type="checkbox" checked={on} readOnly style={{ pointerEvents: "none" }} />
                </button>
              );
            })}
            {!available.length && (
              <p className="muted" style={{ textAlign: "center", padding: "20px 0" }}>
                Semua anggota tim yang cocok sudah ada di dalam grup.
              </p>
            )}
          </div>
        </div>
        <footer className="dialog-f">
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
          <button type="button" className="btn primary" disabled={selected.size === 0 || busy} onClick={handleAdd}>
            Tambahkan ({selected.size})
          </button>
        </footer>
      </div>
    </>
  );
}

function ChatInfoPanel({
  ch,
  onClose,
  onPickChannel,
  isMobileOverlay,
}: {
  ch: ChannelDTO;
  onClose: () => void;
  onPickChannel: (id: string) => void;
  isMobileOverlay?: boolean;
}) {
  const { me, policy } = useViewer();
  const { newTask } = useUi();
  const allTeam = useAllTeam();
  const qc = useQueryClient();
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [nameVal, setNameVal] = useState(ch.name);
  const [descVal, setDescVal] = useState(ch.group?.description ?? ch.description ?? "");

  useEffect(() => {
    setNameVal(ch.name);
    setDescVal(ch.group?.description ?? ch.description ?? "");
    setIsEditing(false);
  }, [ch.id, ch.name, ch.group?.description, ch.description]);

  const msgsQ = useMessages(ch.id);
  const messages = msgsQ.data?.messages ?? [];

  const { imgAtts, docAtts } = useMemo(() => {
    const imgAtts: { id: string; name: string; size: number }[] = [];
    const docAtts: { id: string; name: string; size: number }[] = [];
    for (const m of messages) {
      for (const a of m.attachments) {
        if (a.mime.startsWith("image/")) imgAtts.push(a);
        else docAtts.push(a);
      }
    }
    return { imgAtts, docAtts };
  }, [messages]);

  const isDm = ch.kind === "dm";
  const gid = ch.kind === "group" ? ch.id.slice(2) : null;
  const canManage = ch.kind === "group" && (!!ch.group?.canManage || policy.isAdmin || policy.isBoss || policy.isSuper || policy.isManager);

  // DM partner details
  const partnerEmail = useMemo(() => {
    if (ch.dmUser?.email) return ch.dmUser.email;
    if (ch.id.startsWith("dm:")) {
      const parts = ch.id.slice(3).split(":");
      return parts.find(e => e.toLowerCase() !== me.email.toLowerCase()) || parts[0] || "";
    }
    return "";
  }, [ch, me.email]);

  const dmPartner = useMemo(() => {
    if (!partnerEmail) return undefined;
    return allTeam.find(m => m.email.toLowerCase() === partnerEmail.toLowerCase());
  }, [allTeam, partnerEmail]);

  // Group members
  const groupMembers = useMemo(() => {
    if (ch.kind === "general") return allTeam;
    if (ch.kind === "group" && ch.group?.members) {
      return ch.group.members.map(e => allTeam.find(m => m.email.toLowerCase() === e.toLowerCase()) || {
        email: e,
        name: e.split("@")[0] || "Anggota",
        role: "Anggota",
        group: "",
        isAdmin: false,
        adminGroups: [] as string[],
        hasPhoto: false,
        photoV: 0,
        sortOrder: 0,
        seenAt: null,
        askAt: null,
        managerEmail: null,
        jobdesk: "",
        level: "",
        accountType: "employee" as const,
        canCreateProject: false,
        canCommentAllProjects: false,
        allowedCommentProjectIds: [] as string[],
      });
    }
    return allTeam;
  }, [ch, allTeam]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return groupMembers;
    const q = memberSearch.trim().toLowerCase();
    return groupMembers.filter(m => `${m.name} ${m.role} ${m.group} ${m.email}`.toLowerCase().includes(q));
  }, [groupMembers, memberSearch]);

  const onPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gid) return;
    try {
      const blob = await squarePhoto(file);
      await putImage(`/api/chat/groups/${gid}/photo`, blob);
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Foto profil grup berhasil diperbarui");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengunggah foto grup";
      toast.error(msg);
    } finally {
      e.target.value = "";
    }
  };

  const onDeletePhoto = async () => {
    if (!gid) return;
    try {
      const res = await fetch(`/api/chat/groups/${gid}/photo`, { method: "DELETE", headers: { "x-app": "1" } });
      if (!res.ok) throw new Error("Gagal menghapus foto");
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Foto profil grup dihapus");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus foto";
      toast.error(msg);
    }
  };

  const saveGroupInfo = async () => {
    if (!nameVal.trim()) {
      toast.error("Nama grup tidak boleh kosong");
      return;
    }
    if (!gid) return;
    try {
      await ok(api.chat.groups[":id"].$patch({
        param: { id: gid },
        json: { name: nameVal.trim(), description: descVal.trim() }
      }));
      await qc.invalidateQueries({ queryKey: keys.chat });
      setIsEditing(false);
      toast.success("Info grup berhasil disimpan");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan info grup";
      toast.error(msg);
    }
  };

  const startDm = async (targetEmail: string) => {
    if (targetEmail.toLowerCase() === me.email.toLowerCase()) return;
    try {
      const res = (await ok(api.chat.dm.$post({ json: { targetEmail } }))) as unknown as { channelId: string };
      await qc.invalidateQueries({ queryKey: [...keys.chat, "channels"] });
      onPickChannel(res.channelId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membuka chat";
      toast.error(msg);
    }
  };

  const removeMember = async (targetEmail: string) => {
    if (!gid || !ch.group) return;
    const remaining = ch.group.members.filter(e => e.toLowerCase() !== targetEmail.toLowerCase());
    try {
      await ok(api.chat.groups[":id"].$patch({
        param: { id: gid },
        json: { emails: remaining }
      }));
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Anggota berhasil dikeluarkan");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal mengeluarkan anggota";
      toast.error(msg);
    }
  };

  const addMembers = async (newEmails: string[]) => {
    if (!gid || !ch.group) return;
    const updated = Array.from(new Set([...ch.group.members, ...newEmails]));
    await ok(api.chat.groups[":id"].$patch({
      param: { id: gid },
      json: { emails: updated }
    }));
    await qc.invalidateQueries({ queryKey: keys.chat });
    toast.success(`${newEmails.length} anggota berhasil ditambahkan`);
  };

  const leaveGroup = async () => {
    if (!gid) return;
    try {
      await ok(api.chat.groups[":id"].leave.$post({ param: { id: gid } }));
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Kamu telah keluar dari grup");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal keluar dari grup";
      toast.error(msg);
    }
  };

  const deleteGroup = async () => {
    if (!gid) return;
    try {
      await ok(api.chat.groups[":id"].$delete({ param: { id: gid } }));
      await qc.invalidateQueries({ queryKey: keys.chat });
      toast.success("Grup dihapus");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus grup";
      toast.error(msg);
    }
  };

  return (
    <aside className={"inbox-info" + (isMobileOverlay ? " mobile-overlay" : "")}>
      <div className="info-h">
        <h3>{isDm ? "Info Kontak" : (ch.kind === "general" ? "Info Forum" : (ch.kind === "project" ? "Info Proyek" : "Info Grup"))}</h3>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Tutup info"><X size={18} /></button>
      </div>

      <div className="info-b">
        {isDm ? (
          <>
            <div className="info-hero">
              <div className="info-avatar-wrap">
                {dmPartner ? (
                  <Avatar m={dmPartner} big />
                ) : (
                  <div className="info-avatar-placeholder">{ch.name[0]?.toUpperCase()}</div>
                )}
              </div>
              <h3 className="info-hero-name">{dmPartner?.name || ch.dmUser?.name || ch.name}</h3>
              <p className="info-hero-sub">
                {dmPartner?.role || ch.dmUser?.role || "Anggota Tim"}
                {(dmPartner?.group || ch.dmUser?.group) ? ` · ${dmPartner?.group || ch.dmUser?.group}` : ""}
              </p>
              {dmPartner?.level && (
                <span className="tag off" style={{ textTransform: "capitalize", fontWeight: 700 }}>
                  {dmPartner.level}
                </span>
              )}
            </div>

            <div className="info-sec">
              <div className="info-actions-row">
                {partnerEmail && policy.canManage(partnerEmail) && (
                  <button type="button" className="btn small primary" onClick={() => newTask({ emails: [partnerEmail] })}>
                    <Target size={14} /> Beri Tugas
                  </button>
                )}
                {partnerEmail && (
                  <a href={`mailto:${partnerEmail}`} className="btn small ghost">
                    <Mail size={14} /> Kirim Email
                  </a>
                )}
              </div>
            </div>

            <div className="info-sec">
              <span className="info-sec-title">Email</span>
              <div className="info-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ wordBreak: "break-all" }}>{partnerEmail}</span>
                <button
                  type="button"
                  className="rbtn"
                  style={{ width: 32, height: 32 }}
                  onClick={() => { if (partnerEmail) { void navigator.clipboard.writeText(partnerEmail); toast.success("Email disalin ke clipboard"); } }}
                  aria-label="Salin email"
                  title="Salin email"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div className="info-sec">
              <span className="info-sec-title">Tentang & Jobdesk</span>
              <div className="info-card">
                {dmPartner?.jobdesk || ch.dmUser?.jobdesk ? (
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{dmPartner?.jobdesk || ch.dmUser?.jobdesk}</p>
                ) : (
                  <span className="muted" style={{ fontStyle: "italic" }}>Belum ada deskripsi jobdesk yang ditambahkan.</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="info-hero">
              <div className="info-avatar-wrap">
                {ch.kind === "group" && ch.group?.hasPhoto ? (
                  <img
                    src={`/api/chat/groups/${gid}/photo?v=${ch.group.photoV || 0}`}
                    alt={ch.name}
                    className="info-avatar-img"
                  />
                ) : (
                  <div className={"info-avatar-placeholder" + (ch.kind === "general" ? " gen" : "")}>
                    {ch.kind === "general" ? <MessageSquare size={36} /> : ch.name[0]?.toUpperCase()}
                  </div>
                )}
                {canManage && gid && (
                  <label className="info-avatar-upload" title="Ganti foto profil grup">
                    <Camera size={16} />
                    <input type="file" accept="image/*" hidden onChange={onPhotoPicked} />
                  </label>
                )}
              </div>

              {canManage && gid && ch.group?.hasPhoto && (
                <button type="button" className="linkbtn" style={{ fontSize: ".76rem", color: "var(--red, #ef4444)" }} onClick={onDeletePhoto}>
                  Hapus foto profil
                </button>
              )}

              {isEditing ? (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  <input
                    className="input"
                    value={nameVal}
                    maxLength={40}
                    onChange={e => setNameVal(e.target.value)}
                    placeholder="Nama grup..."
                    autoFocus
                  />
                  <textarea
                    className="input"
                    value={descVal}
                    maxLength={300}
                    rows={3}
                    onChange={e => setDescVal(e.target.value)}
                    placeholder="Tuliskan deskripsi atau tujuan grup..."
                  />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn small ghost" onClick={() => setIsEditing(false)}>Batal</button>
                    <button type="button" className="btn small primary" onClick={saveGroupInfo}>Simpan</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <h3 className="info-hero-name">{ch.name}</h3>
                    {canManage && gid && (
                      <button type="button" className="rbtn" style={{ width: 28, height: 28 }} onClick={() => setIsEditing(true)} title="Edit nama & deskripsi">
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <p className="info-hero-sub">
                    {ch.kind === "general" ? "Forum Publik Seluruh Tim" :
                     ch.kind === "group" ? `Grup · ${groupMembers.length} Anggota` :
                     "Kanal Tim"}
                  </p>
                </>
              )}
            </div>

            {/* Description Card */}
            {!isEditing && (
              <div className="info-sec">
                <div className="info-sec-title">
                  <span>Deskripsi</span>
                  {canManage && gid && (
                    <button type="button" className="linkbtn" style={{ fontSize: ".74rem" }} onClick={() => setIsEditing(true)}>
                      Edit
                    </button>
                  )}
                </div>
                <div className="info-card">
                  {ch.kind === "general" ? (
                    <p style={{ margin: 0 }}>Forum diskusi terbuka untuk seluruh anggota tim HAN Task Tracker. Diskusi umum, pengumuman tim, dan koordinasi pekerjaan.</p>
                  ) : ch.id === "bo-direktur" ? (
                    <p style={{ margin: 0 }}>Kanal koordinasi khusus antara Brand Owner dan Direktur untuk pengawasan dan tugas strategis.</p>
                  ) : (ch.group?.description || descVal) ? (
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ch.group?.description || descVal}</p>
                  ) : (
                    <span className="muted" style={{ fontStyle: "italic" }}>
                      {canManage ? "Belum ada deskripsi. Klik Edit untuk menambahkan deskripsi grup." : "Belum ada deskripsi grup."}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Members Section */}
            <div className="info-sec">
              <div className="info-sec-title">
                <span>Anggota ({groupMembers.length})</span>
                {canManage && gid && (
                  <button type="button" className="btn small primary" style={{ fontSize: ".74rem", padding: "4px 8px" }} onClick={() => setShowAddMember(true)}>
                    <UserPlus size={13} /> + Tambah
                  </button>
                )}
              </div>

              {ch.kind === "general" && (
                <small className="muted" style={{ fontSize: ".74rem" }}>
                  Semua anggota tim secara otomatis menjadi anggota forum ini.
                </small>
              )}

              {groupMembers.length > 5 && (
                <input
                  className="input"
                  type="search"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Cari anggota grup..."
                  style={{ fontSize: ".82rem", padding: "6px 10px" }}
                />
              )}

              <div className="info-members-list">
                {filteredMembers.map(m => {
                  const isCreator = ch.group?.createdBy && m.email.toLowerCase() === ch.group.createdBy.toLowerCase();
                  const isAdm = m.isAdmin || isDirectorMember(m) || isBOMember(m);
                  const isSelf = m.email.toLowerCase() === me.email.toLowerCase();
                  return (
                    <div key={m.email} className="info-member-row">
                      <Avatar m={m} />
                      <div style={{ flex: 1, minWidth: 0, marginLeft: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <b className="clamp1" style={{ fontSize: ".88rem" }}>{m.name}{isSelf ? " (Kamu)" : ""}</b>
                          {isCreator && <span className="tag proj" style={{ fontSize: ".65rem", padding: "1px 5px" }}>Pembuat</span>}
                          {!isCreator && isAdm && <span className="tag late" style={{ fontSize: ".65rem", padding: "1px 5px" }}>Admin</span>}
                        </div>
                        <small className="muted clamp1" style={{ fontSize: ".74rem" }}>
                          {m.role || "Anggota Tim"}{m.group ? ` · ${m.group}` : ""}
                        </small>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {!isSelf && (
                          <button
                            type="button"
                            className="rbtn"
                            style={{ width: 28, height: 28 }}
                            onClick={() => void startDm(m.email)}
                            title={`Kirim pesan pribadi ke ${m.name}`}
                            aria-label={`Chat dengan ${m.name}`}
                          >
                            <MessageCircle size={14} />
                          </button>
                        )}
                        {canManage && gid && !isSelf && !isCreator && (
                          <button
                            type="button"
                            className="rbtn"
                            style={{ width: 28, height: 28, color: "var(--red, #ef4444)" }}
                            onClick={() => {
                              if (window.confirm(`Keluarkan ${m.name} dari grup ini?`)) {
                                void removeMember(m.email);
                              }
                            }}
                            title="Keluarkan dari grup"
                            aria-label={`Keluarkan ${m.name}`}
                          >
                            <UserMinus size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!filteredMembers.length && (
                  <p className="muted" style={{ textAlign: "center", padding: "12px 0", fontSize: ".82rem" }}>
                    Tidak ada anggota yang cocok dengan pencarian.
                  </p>
                )}
              </div>
            </div>

            {/* Group Leave / Delete */}
            {gid && ch.kind === "group" && (
              <div className="info-sec" style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {ch.group?.members.some(e => e.toLowerCase() === me.email.toLowerCase()) && ch.group.createdBy.toLowerCase() !== me.email.toLowerCase() && (
                  <div style={{ display: "flex", width: "100%" }}>
                    <ConfirmButton
                      label="Keluar dari Grup"
                      armed="Yakin ingin keluar dari grup ini?"
                      onConfirm={leaveGroup}
                      className="btn ghost danger"
                    />
                  </div>
                )}
                {canManage && (
                  <div style={{ display: "flex", width: "100%" }}>
                    <ConfirmButton
                      label="Hapus Grup"
                      armed="Yakin hapus grup dan seluruh pesannya?"
                      onConfirm={deleteGroup}
                      className="btn danger"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Shared media for both DM and Group */}
        {(imgAtts.length > 0 || docAtts.length > 0) && (
          <div className="info-sec">
            <span className="info-sec-title">Media & Dokumen Dibagikan</span>
            {imgAtts.length > 0 && (
              <div className="info-media-grid">
                {imgAtts.slice(0, 6).map(img => (
                  <button key={img.id} type="button" className="info-media-thumb" onClick={() => setZoomImg(img.id)} aria-label={`Lihat ${img.name}`}>
                    <img src={`/api/chat/files/${img.id}`} alt={img.name} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {docAtts.length > 0 && (
              <div className="info-docs-list">
                {docAtts.slice(0, 5).map(doc => (
                  <a key={doc.id} className="info-doc-item" href={`/api/chat/files/${doc.id}`} download={doc.name}>
                    <FileText size={18} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b className="clamp1">{doc.name}</b>
                      <small className="muted">{bytes(doc.size)}</small>
                    </div>
                    <Download size={15} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddMember && ch.group?.members && (
        <AddMemberModal
          currentMembers={ch.group.members}
          onClose={() => setShowAddMember(false)}
          onAdd={addMembers}
        />
      )}
      {zoomImg && (
        <div className="lightbox" role="dialog" onClick={() => setZoomImg(null)}>
          <img src={`/api/chat/files/${zoomImg}`} alt="Lampiran" />
        </div>
      )}
    </aside>
  );
}

function Thread({
  ch,
  onBack,
  onToggleInfo,
  infoOpen,
}: {
  ch: ChannelDTO;
  onBack?: () => void;
  onToggleInfo?: () => void;
  infoOpen?: boolean;
}) {
  const { me, member, policy } = useViewer();
  const qc = useQueryClient();
  const q = useMessages(ch.id), list = q.data?.messages ?? [];
  const box = useRef<HTMLDivElement>(null);
  const toEnd = () => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; };
  const [zoom, setZoom] = useState<string | null>(null), [cfg, setCfg] = useState(false);
  const [convertToTask, setConvertToTask] = useState<MessageDTO | null>(null);

  const last = list.at(-1)?.id;
  useEffect(() => { toEnd(); }, [last, ch.id]);
  useEffect(() => { if (ch.unread > 0 || last) void ok(api.chat.channels[":id"].read.$post({ param: { id: ch.id } })).then(() => qc.invalidateQueries({ queryKey: [...keys.chat, "channels"] })); }, [ch.id, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const del = async (id: string) => { await ok(api.chat.messages[":id"].$delete({ param: { id } })); void qc.invalidateQueries({ queryKey: keys.chat }); };
  let lastDay = "", lastWho = "";

  const isDm = ch.kind === "dm";
  const dmMem = isDm && ch.dmUser ? member(ch.dmUser.email) : undefined;
  const isSuperSession = !!ch.isSuperadminSession;

  const pinnedMessages = list.filter(m => m.isPinned && !m.deleted);

  const togglePin = useAction(async (msgId: string) => {
    const res = await ok(api.chat.channels[":id"].messages[":msgId"].pin.$post({ param: { id: ch.id, msgId } })) as { isPinned: boolean };
    await qc.invalidateQueries({ queryKey: keys.chat });
    toast.success(res.isPinned ? "Pesan disematkan 📌" : "Sematkan pesan dilepas");
  });

  const jumpToMsg = (id: string) => {
    const el = document.getElementById("msg-" + id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("is-highlighted");
      setTimeout(() => el.classList.remove("is-highlighted"), 2000);
    }
  };

  return (
    <section className="thread" aria-label={ch.name}>
      <header className="thread-h">
        {onBack && <button className="rbtn" onClick={onBack} aria-label="Kembali ke daftar"><ArrowLeft size={18} /></button>}
        <button
          type="button"
          className="thread-h-main"
          onClick={onToggleInfo}
          aria-label="Buka detail info percakapan"
          title="Klik untuk melihat info detail percakapan"
        >
          {isSuperSession ? (
            <span className="chdot" style={{ background: "linear-gradient(135deg, #F59E0B, #10B981)", color: "#fff" }}>
              <Crown size={18} />
            </span>
          ) : isDm && dmMem ? (
            <Avatar m={dmMem} />
          ) : ch.kind === "group" && ch.group?.hasPhoto ? (
            <img
              src={`/api/chat/groups/${ch.id.slice(2)}/photo?v=${ch.group.photoV || 0}`}
              alt=""
              className="avatar"
              style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover" }}
            />
          ) : (
            <span className={"chdot " + (ch.kind === "general" ? "gen" : "")} data-c={ch.color ?? undefined}><ChIcon c={ch} /></span>
          )}
          <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <b className="clamp1">{ch.name}</b>
              {isSuperSession && <span className="superadmin-tag"><Crown size={10} /> Superadmin</span>}
            </div>
            <small className="muted clamp1">
              {isSuperSession ? "Sesi koordinasi khusus Superadmin (Hellens)" :
               ch.kind === "general" ? "Semua anggota tim · Info forum" :
               ch.kind === "group" ? `${ch.group?.members.length ?? 0} anggota · Info grup` :
               ch.kind === "dm" ? (ch.dmUser?.role || "Percakapan Pribadi · Info kontak") :
               "Anggota proyek · Info"}
            </small>
          </div>
        </button>
        <button
          type="button"
          className={"rbtn" + (infoOpen ? " active" : "")}
          onClick={onToggleInfo}
          aria-label="Info chat"
          title="Detail info percakapan"
        >
          <Info size={18} />
        </button>
        {ch.kind === "group" && ch.group?.canManage && (
          <button type="button" className="rbtn" onClick={() => setCfg(true)} aria-label="Pengaturan grup" title="Pengaturan grup">
            <Settings size={17} />
          </button>
        )}
      </header>

      {isSuperSession && (
        <div className="thread-superadmin-banner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Crown size={16} style={{ color: "#F59E0B" }} />
            <span>Sesi Khusus Superadmin (Hellens)</span>
          </div>
          <span className="superadmin-tag"><ShieldCheck size={11} /> Prioritas</span>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <PinnedBar
          pinnedMessages={pinnedMessages}
          onJumpTo={jumpToMsg}
          onUnpin={id => togglePin.mutate(id)}
        />
      )}

      {cfg && <GroupDialog ch={ch} onClose={() => setCfg(false)} onDone={id => { if (!id) onBack?.(); }} />}
      <div className="msgs" aria-live="polite" ref={box}>
        {q.data?.more && <p className="muted" style={{ textAlign: "center", fontSize: ".78rem" }}>Menampilkan 60 pesan terbaru</p>}
        {list.map(m => {
          const d = dayLabel(m.createdAt), head = d !== lastDay, cont = !head && lastWho === m.email; lastDay = d; lastWho = m.email;
          const mine = m.email === me.email, mem = member(m.email), can = mine || policy.canManage(m.email);
          const isSuperMsg = m.name.toLowerCase().includes("superadmin") || m.name.toLowerCase().includes("hellens") || mem?.level === "superadmin";

          return (
            <Fragment key={m.id}>
              {head && <div className="dayhead"><span>{d}</span></div>}
              <article
                id={"msg-" + m.id}
                className={
                  "msg" +
                  (mine ? " mine" : "") +
                  (cont ? " cont" : "") +
                  (m.isPinned ? " is-pinned" : "") +
                  (isSuperMsg ? " from-superadmin" : "")
                }
              >
                {!cont && (
                  mem ? (
                    <Avatar m={mem} />
                  ) : (
                    <span
                      className="avatar"
                      style={isSuperMsg ? { background: "linear-gradient(135deg, #F59E0B, #10B981)", color: "#fff", fontWeight: 800 } : undefined}
                    >
                      {isSuperMsg ? <Crown size={15} /> : m.name[0]}
                    </span>
                  )
                )}
                <div className="mbody">
                  {!cont && (
                    <div className="mmeta">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <b>{mine ? "Kamu" : m.name}</b>
                        {isSuperMsg && (
                          <span className="superadmin-tag" title="Superadmin (Hellens)">
                            <Crown size={9} /> Superadmin
                          </span>
                        )}
                      </span>
                      <small>{fmtTime(m.createdAt)}</small>
                    </div>
                  )}

                  {m.isPinned && (
                    <div className="pinned-badge">
                      <Pin size={10} /> Disematkan {m.pinnedByName ? `oleh ${m.pinnedByName}` : ""}
                    </div>
                  )}

                  {m.deleted ? <p className="mtext gone">Pesan dihapus</p> : <>
                    {m.text && <Body m={m} />}
                    {m.attachments.length > 0 && <div className="matt">{m.attachments.map(a => a.mime.startsWith("image/")
                      ? <button key={a.id} className="mimg" onClick={() => setZoom(a.id)} aria-label={`Perbesar ${a.name}`}><img src={`/api/chat/files/${a.id}`} alt={a.name} loading="lazy" /></button>
                      : <a key={a.id} className="mfile" href={`/api/chat/files/${a.id}`} download={a.name}><FileText size={18} /><span><b className="clamp1">{a.name}</b><small>{bytes(a.size)}</small></span><Download size={16} /></a>)}</div>}
                  </>}

                  {/* Hover Actions: Jadikan Tugas, Pin, Hapus */}
                  {!m.deleted && (
                    <div className="m-actions">
                      <button
                        type="button"
                        className="m-act-btn"
                        title="Jadikan Tugas (Lark style)"
                        onClick={() => setConvertToTask(m)}
                      >
                        <CheckSquare size={13} />
                      </button>
                      <button
                        type="button"
                        className={"m-act-btn" + (m.isPinned ? " pinned" : "")}
                        title={m.isPinned ? "Lepas pin pesan" : "Sematkan pesan"}
                        onClick={() => togglePin.mutate(m.id)}
                      >
                        <Pin size={13} />
                      </button>
                      {can && (
                        <button
                          type="button"
                          className="m-act-btn"
                          title="Hapus pesan"
                          style={{ color: "var(--bad)" }}
                          onClick={() => void del(m.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            </Fragment>);
        })}
        {!list.length && !q.isLoading && <Empty art="activity" title="Belum ada pesan">Mulai percakapan. Ketik @ untuk menyebut orang atau # untuk menautkan tugas.</Empty>}
      </div>
      <ChatComposer channel={ch.id} onSent={() => requestAnimationFrame(toEnd)} />
      {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(null)}><img src={`/api/chat/files/${zoom}`} alt="Lampiran" /></div>}
      {convertToTask && (
        <ConvertMessageToTaskModal
          message={convertToTask}
          channel={ch.id}
          onClose={() => setConvertToTask(null)}
        />
      )}
    </section>
  );
}

function DirectMessageDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { me, policy } = useViewer();
  const allTeam = useAllTeam();
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const startDm = useAction(async (targetEmail: string) => {
    const res = (await ok(api.chat.dm.$post({ json: { targetEmail } }))) as unknown as { channelId: string; name: string };
    await qc.invalidateQueries({ queryKey: [...keys.chat, "channels"] });
    return res.channelId;
  }, { done: "Percakapan dibuka" });

  const people = allTeam.filter(m => m.email !== me.email && policy.canChatWith(m.email) && (!q.trim() || `${m.name} ${m.role} ${m.group}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label="Mulai Chat Pribadi">
        <div className="dialog-h">
          <div>
            <h2>Chat Pribadi Baru</h2>
            <p className="muted">Pilih anggota tim untuk memulai percakapan 1-on-1.</p>
          </div>
          <button type="button" className="iconbtn" aria-label="Tutup" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-b">
          <section className="dsec">
            <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau jabatan..." autoFocus />
            <div style={{ maxHeight: 320, overflow: "auto", display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {people.map(m => (
                <button key={m.email} type="button" className="menuitem" style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px" }}
                  onClick={() => {
                    startDm.mutate(m.email, { onSuccess: (id: unknown) => { onDone(String(id)); onClose(); } });
                  }}>
                  <Avatar m={m} />
                  <div style={{ textAlign: "left", marginLeft: 10 }}>
                    <b style={{ display: "block" }}>{m.name}</b>
                    <small className="muted">{m.role || "Anggota Tim"}{m.group ? ` · ${m.group}` : ""}</small>
                  </div>
                </button>
              ))}
              {!people.length && <p className="muted" style={{ textAlign: "center", padding: "20px 0" }}>Tidak ada anggota yang ditemukan</p>}
            </div>
          </section>
        </div>
        <footer className="dialog-f">
          <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
        </footer>
      </div>
    </>
  );
}

function Channels({ list, active, onPick }: { list: ChannelDTO[]; active: string | null; onPick: (id: string) => void }) {
  const { member } = useViewer();
  const dms = list.filter(c => c.kind === "dm");
  const channels = list.filter(c => c.kind !== "dm");

  const renderItem = (c: ChannelDTO) => {
    const isDm = c.kind === "dm";
    const mem = isDm && c.dmUser ? member(c.dmUser.email) : undefined;
    const isSuper = !!c.isSuperadminSession;
    return (
      <li key={c.id}>
        <button
          className={(c.id === active ? "on " : "") + (isSuper ? "chitem superadmin" : "")}
          onClick={() => onPick(c.id)}
          aria-current={c.id === active ? "true" : undefined}
        >
          {isSuper ? (
            <span className="chdot" style={{ background: "linear-gradient(135deg, #F59E0B, #10B981)", color: "#fff" }}>
              <Crown size={18} />
            </span>
          ) : isDm && mem ? (
            <Avatar m={mem} />
          ) : c.kind === "group" && c.group?.hasPhoto ? (
            <img
              src={`/api/chat/groups/${c.id.slice(2)}/photo?v=${c.group.photoV || 0}`}
              alt=""
              className="avatar"
              style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover" }}
            />
          ) : (
            <span className={"chdot " + (c.kind === "general" ? "gen" : "")} data-c={c.color ?? undefined}><ChIcon c={c} /></span>
          )}
          <span className="chmain">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <b className="clamp1">{c.name}</b>
              {isSuper && <span className="superadmin-tag"><Crown size={10} /> Superadmin</span>}
            </span>
            <small className="clamp1 muted">{c.last ? `${c.last.name}: ${c.last.text.replace(/\[\[\d+\]\]/g, "…")}` : "Belum ada pesan"}</small>
          </span>
          <span className="chside">{c.last && <small className="muted">{ago(c.last.at)}</small>}{c.unread > 0 && <i className="cbadge">{c.unread > 99 ? "99+" : c.unread}</i>}</span>
        </button>
      </li>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {dms.length > 0 && (
        <div>
          <span className="legend" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", fontWeight: 700, paddingLeft: 8, display: "block", marginBottom: 4 }}>
            Chat Pribadi
          </span>
          <ul className="chlist">{dms.map(renderItem)}</ul>
        </div>
      )}

      <div>
        <span className="legend" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", fontWeight: 700, paddingLeft: 8, display: "block", marginBottom: 4 }}>
          Kanal & Grup
        </span>
        <ul className="chlist">{channels.map(renderItem)}</ul>
      </div>
    </div>
  );
}

function Notifs() {
  const q = useInbox(true), qc = useQueryClient(), { openTask } = useUi(), [, go] = useLocation();
  const items = q.data?.items ?? [];
  const read = async (ids?: string[]) => { await ok(api.inbox.notifications.read.$post({ json: { ids } })); await qc.invalidateQueries({ queryKey: keys.inbox }); };
  return (
    <section className="bc">
      <div className="bc-h"><h2>Notifikasi</h2>{(q.data?.unread ?? 0) > 0 && <button className="btn small" onClick={() => void read()}>Tandai semua dibaca</button>}</div>
      <ul className="alist">{items.map(n => (
        <li key={n.id}><button className={"nrow" + (n.read ? "" : " unread")} onClick={() => { void read([n.id]); if (n.taskId) openTask(n.taskId); else if (n.kind === "chat") go("/inbox"); else if (n.kind === "leave") go("/izin"); }}>
          <i /><span><span className="clamp3">{n.text}</span><small className="muted">{ago(n.at)} lalu</small></span></button></li>))}</ul>
      {!items.length && <Empty art="activity" title="Belum ada notifikasi" />}
    </section>
  );
}

export function InboxPage() {
  const [params, setParams] = useSearchParams();
  const mobile = useIsMobile();
  const { me, team } = useViewer();
  const chans = useChannels(), list = useMemo(() => chans.data ?? [], [chans.data]);
  const unread = list.reduce((s, c) => s + c.unread, 0), notif = useInbox(true).data?.unread ?? 0;
  const [newGroup, setNewGroup] = useState(false);
  const [newDm, setNewDm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tab, setTab] = useState(params.get("tab") === "notif" ? "notif" : "pesan");
  const picked = params.get("c");

  const fallbackDm = useMemo<ChannelDTO | null>(() => {
    if (!picked || !picked.startsWith("dm:")) return null;
    const parts = picked.slice(3).split(":");
    if (!parts.includes(me.email)) return null;
    const partnerEmail = parts.find(e => e !== me.email) || parts[0];
    const partner = team.find(m => m.email === partnerEmail);
    return {
      id: picked,
      kind: "dm",
      name: partner?.name ?? partnerEmail ?? "Chat Pribadi",
      projectId: null,
      color: "lilac",
      unread: 0,
      last: null,
      dmUser: partner ? { email: partner.email, name: partner.name, role: partner.role, hasPhoto: partner.hasPhoto, photoV: partner.photoV } : undefined,
    };
  }, [picked, me.email, team]);

  const active = list.find(c => c.id === picked) ?? fallbackDm ?? (mobile ? null : list[0] ?? null);
  const pick = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set("c", id); else n.delete("c"); return n; });
  const inThread = mobile && tab === "pesan" && !!active;
  return (
    <Page noNew title="Inbox" sub={inThread ? undefined : "Pesan tim, chat pribadi, dan notifikasi"}
      tabs={inThread ? undefined : [{ id: "pesan", label: `Pesan${unread ? ` (${unread})` : ""}` }, { id: "notif", label: `Notifikasi${notif ? ` (${notif})` : ""}` }]} tab={tab} onTab={setTab}>
      {tab === "notif" ? <Notifs /> : chans.isError ? <p className="muted">Tidak bisa memuat pesan.</p> : (
        <div className={"inbox" + (inThread ? " in-thread" : "") + (showInfo && active && !mobile ? " has-info" : "")}>
          {(!mobile || !active) && (
            <aside className="inbox-l">
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button className="btn small primary" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={() => setNewDm(true)}>
                  <MessageCircle size={14} /><span>+ Chat Pribadi</span>
                </button>
                <button className="btn small ghost" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={() => setNewGroup(true)}>
                  <Users size={14} /><span>+ Grup</span>
                </button>
              </div>
              <Channels list={list} active={active?.id ?? null} onPick={id => { pick(id); }} />
              {!list.length && !chans.isLoading && <Empty art="people" title="Belum ada kanal" />}
            </aside>
          )}
          {active ? (
            <Thread
              key={active.id}
              ch={active}
              onBack={mobile ? () => pick(null) : undefined}
              onToggleInfo={() => setShowInfo(v => !v)}
              infoOpen={showInfo}
            />
          ) : !mobile && (
            <div className="thread empty"><Empty art="activity" title="Pilih percakapan" /></div>
          )}
          {active && showInfo && !mobile && (
            <ChatInfoPanel
              key={`info-${active.id}`}
              ch={active}
              onClose={() => setShowInfo(false)}
              onPickChannel={id => { pick(id); }}
            />
          )}
        </div>
      )}
      {active && showInfo && mobile && (
        <ChatInfoPanel
          key={`info-mobile-${active.id}`}
          ch={active}
          onClose={() => setShowInfo(false)}
          onPickChannel={id => { pick(id); }}
          isMobileOverlay
        />
      )}
      {newGroup && <GroupDialog onClose={() => setNewGroup(false)} onDone={id => { if (id) pick(id); }} />}
      {newDm && <DirectMessageDialog onClose={() => setNewDm(false)} onDone={id => { if (id) pick(id); }} />}
    </Page>
  );
}

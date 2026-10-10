import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Hash, MessageSquare, Plus, Settings, Trash2, Users } from "lucide-react";
import type { ChannelDTO, ChatRefDTO, MessageDTO } from "@shared/schemas";
import { ChatComposer } from "../components/ChatComposer";
import { Page } from "../components/Page";
import { Avatar, Empty } from "../components/ui";
import { GroupDialog } from "../components/GroupDialog";
import { api, ok } from "../lib/api";
import { fmtTime } from "../lib/format";
import { keys, useChannels, useInbox, useMessages } from "../lib/queries";
import { useIsMobile } from "../lib/useMedia";
import { useUi, useViewer } from "../lib/viewer";

const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} mnt` : m < 1440 ? `${Math.floor(m / 60)} jam` : `${Math.floor(m / 1440)} hr`; };
const dayLabel = (ms: number) => { const d = new Date(ms), n = new Date(), y = new Date(Date.now() - 864e5); const same = (a: Date, b: Date) => a.toDateString() === b.toDateString(); return same(d, n) ? "Hari ini" : same(d, y) ? "Kemarin" : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(d); };
const bytes = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Message text with its [[n]] placeholders turned into clickable chips (person, task, project). */
function Body({ m }: { m: MessageDTO }) {
  const { openTask } = useUi();
  const [, go] = useLocation();
  const parts = m.text.split(/(\[\[\d+\]\])/g);
  const chip = (r: ChatRefDTO) => r.type === "member" ? <span key={r.id} className="rchip mem">@{r.label}</span>
    : r.type === "project" ? <button key={r.id} className="rchip proj" onClick={() => go("/proyek/" + r.id)}><Hash size={12} />{r.label}</button>
    : r.ok ? <button key={r.id} className="rchip task" onClick={() => openTask(r.id)}><FileText size={12} />{r.label}</button> : <span key={r.id} className="rchip off" title="Kamu tidak punya akses ke tugas ini"><FileText size={12} />Tugas pribadi</span>;
  return <p className="mtext">{parts.map((p, i) => { const k = /^\[\[(\d+)\]\]$/.exec(p); const r = k ? m.refs[Number(k[1])] : undefined; return r ? <Fragment key={i}>{chip(r)}</Fragment> : <Fragment key={i}>{p}</Fragment>; })}</p>;
}

const ChIcon = ({ c }: { c: ChannelDTO }) => c.kind === "general" ? <MessageSquare size={16} /> : c.kind === "group" ? <Users size={16} /> : <Hash size={16} />;

function Thread({ ch, onBack }: { ch: ChannelDTO; onBack?: () => void }) {
  const { me, member, policy } = useViewer();
  const qc = useQueryClient();
  const q = useMessages(ch.id), list = q.data?.messages ?? [];
  const box = useRef<HTMLDivElement>(null);
  const toEnd = () => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }; // scroll the list itself, not the page
  const [zoom, setZoom] = useState<string | null>(null), [cfg, setCfg] = useState(false);
  const last = list.at(-1)?.id;
  useEffect(() => { toEnd(); }, [last, ch.id]);
  useEffect(() => { if (ch.unread > 0 || last) void ok(api.chat.channels[":id"].read.$post({ param: { id: ch.id } })).then(() => qc.invalidateQueries({ queryKey: [...keys.chat, "channels"] })); }, [ch.id, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const del = async (id: string) => { await ok(api.chat.messages[":id"].$delete({ param: { id } })); void qc.invalidateQueries({ queryKey: keys.chat }); };
  let lastDay = "", lastWho = "";
  return (
    <section className="thread" aria-label={ch.name}>
      <header className="thread-h">
        {onBack && <button className="rbtn" onClick={onBack} aria-label="Kembali ke daftar"><ArrowLeft size={18} /></button>}
        <span className={"chdot " + (ch.kind === "general" ? "gen" : "")} data-c={ch.color ?? undefined}><ChIcon c={ch} /></span>
        <div style={{ minWidth: 0, flex: 1 }}><b className="clamp1">{ch.name}</b><small className="muted">{ch.kind === "general" ? "Semua anggota tim" : ch.kind === "group" ? `${ch.group!.members.length} anggota` : "Anggota proyek dan atasan"}</small></div>
        {ch.kind === "group" && <button className="rbtn" onClick={() => setCfg(true)} aria-label="Pengaturan grup"><Settings size={17} /></button>}
      </header>
      {cfg && <GroupDialog ch={ch} onClose={() => setCfg(false)} onDone={id => { if (!id) onBack?.(); }} />}
      <div className="msgs" aria-live="polite" ref={box}>
        {q.data?.more && <p className="muted" style={{ textAlign: "center", fontSize: ".78rem" }}>Menampilkan 60 pesan terbaru</p>}
        {list.map(m => {
          const d = dayLabel(m.createdAt), head = d !== lastDay, cont = !head && lastWho === m.email; lastDay = d; lastWho = m.email;
          const mine = m.email === me.email, mem = member(m.email), can = mine || policy.canManage(m.email);
          return (
            <Fragment key={m.id}>
              {head && <div className="dayhead"><span>{d}</span></div>}
              <article className={"msg" + (mine ? " mine" : "") + (cont ? " cont" : "")}>
                {!cont && (mem ? <Avatar m={mem} /> : <span className="avatar">{m.name[0]}</span>)}
                <div className="mbody">
                  {!cont && <div className="mmeta"><b>{mine ? "Kamu" : m.name}</b><small>{fmtTime(m.createdAt)}</small></div>}
                  {m.deleted ? <p className="mtext gone">Pesan dihapus</p> : <>
                    {m.text && <Body m={m} />}
                    {m.attachments.length > 0 && <div className="matt">{m.attachments.map(a => a.mime.startsWith("image/")
                      ? <button key={a.id} className="mimg" onClick={() => setZoom(a.id)} aria-label={`Perbesar ${a.name}`}><img src={`/api/chat/files/${a.id}`} alt={a.name} loading="lazy" /></button>
                      : <a key={a.id} className="mfile" href={`/api/chat/files/${a.id}`} download={a.name}><FileText size={18} /><span><b className="clamp1">{a.name}</b><small>{bytes(a.size)}</small></span><Download size={16} /></a>)}</div>}
                  </>}
                  {can && !m.deleted && <button className="mdel" aria-label="Hapus pesan" onClick={() => void del(m.id)}><Trash2 size={13} /></button>}
                </div>
              </article>
            </Fragment>);
        })}
        {!list.length && !q.isLoading && <Empty art="activity" title="Belum ada pesan">Mulai percakapan. Ketik @ untuk menyebut orang atau # untuk menautkan tugas.</Empty>}
      </div>
      <ChatComposer channel={ch.id} onSent={() => requestAnimationFrame(toEnd)} />
      {zoom && <div className="lightbox" role="dialog" onClick={() => setZoom(null)}><img src={`/api/chat/files/${zoom}`} alt="Lampiran" /></div>}
    </section>
  );
}

function Channels({ list, active, onPick }: { list: ChannelDTO[]; active: string | null; onPick: (id: string) => void }) {
  return (
    <ul className="chlist">{list.map(c => (
      <li key={c.id}><button className={c.id === active ? "on" : ""} onClick={() => onPick(c.id)} aria-current={c.id === active ? "true" : undefined}>
        <span className={"chdot " + (c.kind === "general" ? "gen" : "")} data-c={c.color ?? undefined}><ChIcon c={c} /></span>
        <span className="chmain"><b className="clamp1">{c.name}</b><small className="clamp1 muted">{c.last ? `${c.last.name}: ${c.last.text.replace(/\[\[\d+\]\]/g, "…")}` : "Belum ada pesan"}</small></span>
        <span className="chside">{c.last && <small className="muted">{ago(c.last.at)}</small>}{c.unread > 0 && <i className="cbadge">{c.unread > 99 ? "99+" : c.unread}</i>}</span>
      </button></li>))}</ul>
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
  const chans = useChannels(), list = useMemo(() => chans.data ?? [], [chans.data]);
  const unread = list.reduce((s, c) => s + c.unread, 0), notif = useInbox(true).data?.unread ?? 0;
  const [newGroup, setNewGroup] = useState(false);
  const [tab, setTab] = useState(params.get("tab") === "notif" ? "notif" : "pesan");
  const picked = params.get("c");
  const active = list.find(c => c.id === picked) ?? (mobile ? null : list[0] ?? null);
  const pick = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set("c", id); else n.delete("c"); return n; });
  const inThread = mobile && tab === "pesan" && !!active;
  return (
    <Page noNew title="Inbox" sub={inThread ? undefined : "Pesan tim dan notifikasi"}
      tabs={inThread ? undefined : [{ id: "pesan", label: `Pesan${unread ? ` (${unread})` : ""}` }, { id: "notif", label: `Notifikasi${notif ? ` (${notif})` : ""}` }]} tab={tab} onTab={setTab}>
      {tab === "notif" ? <Notifs /> : chans.isError ? <p className="muted">Tidak bisa memuat pesan.</p> : (
        <div className={"inbox" + (inThread ? " in-thread" : "")}>
          {(!mobile || !active) && <aside className="inbox-l"><button className="btn small" style={{ margin: "0 0 8px" }} onClick={() => setNewGroup(true)}><Plus size={14} />Grup baru</button><Channels list={list} active={active?.id ?? null} onPick={pick} />{!list.length && !chans.isLoading && <Empty art="people" title="Belum ada kanal" />}</aside>}
          {active ? <Thread key={active.id} ch={active} onBack={mobile ? () => pick(null) : undefined} /> : !mobile && <div className="thread empty"><Empty art="activity" title="Pilih percakapan" /></div>}
        </div>
      )}
      {newGroup && <GroupDialog onClose={() => setNewGroup(false)} onDone={id => { if (id) pick(id); }} />}
    </Page>
  );
}

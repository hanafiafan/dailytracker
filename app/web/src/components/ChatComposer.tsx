import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, FileText, Hash, Paperclip, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import type { AttachmentDTO } from "@shared/schemas";
import { addDays } from "@shared/time";
import { api, ok } from "../lib/api";
import { today } from "../lib/format";
import { errorText, keys, useTasks } from "../lib/queries";
import { useIsMobile } from "../lib/useMedia";
import { useViewer } from "../lib/viewer";
import { Avatar } from "./ui";

type Ref = { type: "member" | "task" | "project"; id: string; label: string; lit: string };
type Pick = { key: string; ref: Ref; hint: string; color?: string };
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Message box: @ picks a person, # picks a task or project (also by the buttons, for phones), the clip adds files. Enter sends, Shift+Enter breaks the line. */
export function ChatComposer({ channel, onSent }: { channel: string; onSent: () => void }) {
  const { team, projects, member } = useViewer();
  const qc = useQueryClient(), mobile = useIsMobile();
  const box = useRef<HTMLTextAreaElement>(null), file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(""), [refs, setRefs] = useState<Ref[]>([]), [files, setFiles] = useState<AttachmentDTO[]>([]);
  const [trig, setTrig] = useState<{ ch: "@" | "#"; q: string; at: number } | null>(null), [sel, setSel] = useState(0), [busy, setBusy] = useState(false), [up, setUp] = useState(0);
  const tasks = useTasks(addDays(today(), -14), !!trig && trig.ch === "#").data ?? [];

  const picks: Pick[] = useMemo(() => {
    if (!trig) return [];
    const q = trig.q.toLowerCase();
    if (trig.ch === "@") return team.filter(m => !q || m.name.toLowerCase().includes(q)).slice(0, 8).map(m => ({ key: m.email, hint: m.role || m.group, ref: { type: "member" as const, id: m.email, label: m.name, lit: "@" + m.name } }));
    const ps = projects.filter(p => !p.archived && (!q || p.name.toLowerCase().includes(q))).slice(0, 4).map(p => ({ key: "p" + p.id, hint: "Proyek", color: p.color, ref: { type: "project" as const, id: p.id, label: p.name, lit: "#" + p.name } }));
    const ts = tasks.filter(t => !q || t.title.toLowerCase().includes(q)).slice(0, 6).map(t => ({ key: "t" + t.id, hint: "Tugas · " + (member(t.email)?.name ?? ""), ref: { type: "task" as const, id: t.id, label: t.title, lit: "#" + t.title.slice(0, 60) } }));
    return [...ps, ...ts];
  }, [trig, team, projects, tasks, member]);

  const detect = (v: string, caret: number) => {
    const m = /(^|\s)([@#])([^\s@#]{0,30})$/.exec(v.slice(0, caret));
    setTrig(m ? { ch: m[2] as "@" | "#", q: m[3] ?? "", at: caret - (m[3]?.length ?? 0) - 1 } : null); setSel(0);
  };
  const choose = (p: Pick) => {
    if (!trig) return;
    const el = box.current, caret = el?.selectionStart ?? text.length;
    const next = text.slice(0, trig.at) + p.ref.lit + " " + text.slice(caret);
    setText(next); setRefs(r => (r.some(x => x.type === p.ref.type && x.id === p.ref.id && x.lit === p.ref.lit) ? r : [...r, p.ref])); setTrig(null);
    requestAnimationFrame(() => { el?.focus(); const pos = trig.at + p.ref.lit.length + 1; el?.setSelectionRange(pos, pos); });
  };
  const insert = (ch: "@" | "#") => {
    const el = box.current, pos = el?.selectionStart ?? text.length, pre = text.slice(0, pos), need = pre && !/\s$/.test(pre) ? " " : "";
    const next = pre + need + ch + text.slice(pos); setText(next); const at = pos + need.length + 1;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at, at); detect(next, at); });
  };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of [...list].slice(0, 6 - files.length)) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name}: maksimal 8 MB`); continue; }
      setUp(n => n + 1);
      try {
        const fd = new FormData(); fd.set("channel", channel); fd.set("file", f);
        const res = await fetch("/api/chat/attachments", { method: "POST", body: fd, headers: { "x-app": "1" } });
        const j = await res.json() as AttachmentDTO & { error?: string };
        if (!res.ok) throw new Error(j.error ?? "Gagal mengunggah");
        setFiles(x => [...x, j]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal mengunggah"); }
      setUp(n => n - 1);
    }
    if (file.current) file.current.value = "";
  };
  const send = async () => {
    const t = text.trim();
    if ((!t && !files.length) || busy || up) return;
    setBusy(true);
    try {
      // links inside the text become [[n]] placeholders; the server keeps who/what they point at, each viewer sees only what they may
      const used: Ref[] = []; let body = t;
      for (const r of refs) if (body.includes(r.lit)) { body = body.replace(r.lit, `[[${used.length}]]`); used.push(r); }
      await ok(api.chat.channels[":id"].messages.$post({ param: { id: channel }, json: { text: body, refs: used.map(({ type, id }) => ({ type, id })), attachmentIds: files.map(f => f.id) } }));
      setText(""); setRefs([]); setFiles([]); setTrig(null); onSent();
      void qc.invalidateQueries({ queryKey: keys.chat });
    } catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <div className="composer">
      {trig && picks.length > 0 && (
        <ul className="cpicks" role="listbox" aria-label={trig.ch === "@" ? "Sebut orang" : "Tautkan tugas atau proyek"}>
          {picks.map((p, i) => (
            <li key={p.key}><button role="option" aria-selected={i === sel} onMouseDown={e => { e.preventDefault(); choose(p); }} onMouseEnter={() => setSel(i)}>
              {p.ref.type === "member" ? <Avatar m={member(p.ref.id)!} /> : p.ref.type === "task" ? <span className="cdot task"><FileText size={15} /></span> : <span className="cdot" data-c={p.color}><Hash size={15} /></span>}<span className="clamp1"><b>{p.ref.label}</b><small>{p.hint}</small></span></button></li>))}
        </ul>
      )}
      {(files.length > 0 || up > 0) && <div className="cfiles">{files.map(f => <span key={f.id} className="chip"><FileText size={13} /><span className="clamp1">{f.name}</span><small>{size(f.size)}</small><button aria-label={`Hapus ${f.name}`} onClick={() => setFiles(x => x.filter(y => y.id !== f.id))}><X size={12} /></button></span>)}{up > 0 && <span className="chip">Mengunggah…</span>}</div>}
      <div className="cbox">
        <button className="rbtn" aria-label="Lampirkan berkas" onClick={() => file.current?.click()}><Paperclip size={18} /></button>
        <input ref={file} type="file" multiple hidden accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/zip,text/plain,text/csv,.docx,.xlsx,.pptx" onChange={e => void upload(e.target.files)} />
        <textarea ref={box} rows={1} value={text} placeholder={mobile ? "Tulis pesan…" : "Tulis pesan… @ untuk menyebut, # untuk tugas atau proyek"} aria-label="Pesan" maxLength={2000}
          onChange={e => { setText(e.target.value); detect(e.target.value, e.target.selectionStart); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
          onKeyDown={e => {
            if (trig && picks.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => (s + 1) % picks.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => (s - 1 + picks.length) % picks.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(picks[sel]!); return; }
              if (e.key === "Escape") { setTrig(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          }} />
        <button className="rbtn" aria-label="Sebut orang" onClick={() => insert("@")}><AtSign size={18} /></button>
        <button className="rbtn" aria-label="Tautkan tugas atau proyek" onClick={() => insert("#")}><Hash size={18} /></button>
        <button className="rbtn send" aria-label="Kirim" disabled={busy || !!up || (!text.trim() && !files.length)} onClick={() => void send()}><SendHorizontal size={18} /></button>
      </div>
    </div>
  );
}

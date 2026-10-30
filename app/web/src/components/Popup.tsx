import { createPortal } from "react-dom";
import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Quote, X } from "lucide-react";
import type { PopupBlock, PopupDTO } from "@shared/schemas";
import { api, ok } from "../lib/api";
import { keys, useAction, usePopups } from "../lib/queries";

/** YouTube/Vimeo links become an embed; any other address is treated as a video file. */
export function videoEmbed(url: string): { embed: string } | { file: string } {
  try {
    const u = new URL(url), h = u.hostname.replace(/^www\./, "");
    const yt = h === "youtu.be" ? u.pathname.slice(1) : h.endsWith("youtube.com") ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1]) : null;
    if (yt && /^[\w-]{6,}$/.test(yt)) return { embed: "https://www.youtube-nocookie.com/embed/" + yt };
    const vm = h === "vimeo.com" ? u.pathname.match(/^\/(\d+)/)?.[1] : null;
    if (vm) return { embed: "https://player.vimeo.com/video/" + vm };
  } catch { /* fall through: let the browser try it as a file */ }
  return { file: url };
}

/** `**tebal**` is the only inline markup: enough to stress a word without letting anyone inject HTML. */
const inline = (t: string): ReactNode[] => t.split(/\*\*(.+?)\*\*/g).map((x, i) => i % 2 ? <b key={i}>{x}</b> : x);

export const fmtUntil = (ms: number) => new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TONE = { info: { icon: Info, bg: "var(--info-soft)" }, warn: { icon: AlertTriangle, bg: "var(--warn-soft)" }, ok: { icon: CheckCircle2, bg: "var(--ok-soft)" } } as const;

export function PopupBlocks({ blocks }: { blocks: PopupBlock[] }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": return <h3 key={i} style={{ fontSize: "1.05rem", marginTop: 4 }}>{inline(b.text)}</h3>;
          case "text": return <p key={i} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{inline(b.text)}</p>;
          case "list": {
            const st = b.style ?? "bullet";
            return (
              <ol key={i} style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {b.items.map((t, j) => (
                  <li key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", overflowWrap: "anywhere" }}>
                    {st === "number" ? <span aria-hidden style={{ flex: "none", width: 24, height: 24, borderRadius: "50%", background: "var(--ink)", color: "var(--surface)", fontSize: ".78rem", fontWeight: 700, display: "grid", placeItems: "center" }}>{j + 1}</span>
                      : st === "check" ? <CheckCircle2 size={20} aria-hidden style={{ flex: "none", color: "var(--ok)", marginTop: 1 }} />
                      : <span aria-hidden style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: "var(--blue)", marginTop: 9, marginInline: 8 }} />}
                    <span>{inline(t)}</span>
                  </li>
                ))}
              </ol>
            );
          }
          case "quote": return <blockquote key={i} style={{ margin: 0, padding: "4px 0 4px 14px", borderLeft: "3px solid var(--blue)" }}><Quote size={14} aria-hidden style={{ color: "var(--blue)" }} /><p style={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>{inline(b.text)}</p>{b.by && <small className="muted">— {b.by}</small>}</blockquote>;
          case "accordion": return <details key={i} style={{ border: "1px solid var(--line-2)", borderRadius: "var(--radius)", padding: "8px 12px" }}><summary style={{ cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>{b.title}<ChevronDown size={16} aria-hidden /></summary><p style={{ whiteSpace: "pre-wrap", marginTop: 8, overflowWrap: "anywhere" }}>{inline(b.text)}</p></details>;
          case "divider": return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--line-2)", margin: "4px 0" }} />;
          case "callout": {
            const { icon: Icon, bg } = TONE[b.tone];
            return <div key={i} role="note" style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius)", background: bg }}><Icon size={18} style={{ flex: "none", marginTop: 2 }} aria-hidden /><span style={{ whiteSpace: "pre-wrap" }}>{inline(b.text)}</span></div>;
          }
          case "image": return <figure key={i} style={{ margin: 0 }}><img src={b.src} alt={b.caption} style={{ width: "100%", borderRadius: "var(--radius)", display: "block" }} />{b.caption && <figcaption className="muted" style={{ fontSize: ".8rem", marginTop: 4 }}>{b.caption}</figcaption>}</figure>;
          case "video": {
            const v = videoEmbed(b.url);
            return "embed" in v
              ? <iframe key={i} src={v.embed} title="Video" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: "var(--radius)" }} />
              : <video key={i} src={v.file} controls playsInline preload="metadata" style={{ width: "100%", borderRadius: "var(--radius)" }} />;
          }
          case "button": return <a key={i} className="btn" href={b.url} target="_blank" rel="noopener noreferrer" style={{ justifySelf: "start" }}>{b.label} ↗</a>;
        }
      })}
    </div>
  );
}

export function PopupDialog({ popup, onClose, closeLabel = "Mengerti", above }: { popup: Pick<PopupDTO, "title" | "blocks"> & { endsAt?: number | null }; onClose: () => void; closeLabel?: string; /** Opened on top of another dialog (the editor preview). */ above?: boolean }) {
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" style={above ? { zIndex: 60 } : undefined} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={popup.title} style={above ? { zIndex: 61 } : undefined}>
        <div className="dialog-h"><h2>{popup.title}</h2><button className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button></div>
        <div className="dialog-b"><PopupBlocks blocks={popup.blocks} /></div>
        <div className="dialog-f">{popup.endsAt && <small className="muted" style={{ marginRight: "auto", alignSelf: "center" }}>Berlaku sampai {fmtUntil(popup.endsAt)}</small>}<button className="btn" onClick={onClose} autoFocus>{closeLabel}</button></div>
      </div>
    </>,
    document.body,
  );
}

/** Shows the oldest active popup this person has not dismissed yet, one at a time. */
export function PopupGate() {
  const q = usePopups("active");
  const seen = useAction((id: string) => ok(api.popups[":id"].seen.$post({ param: { id } })), { refresh: [keys.popups] });
  const next = q.data?.[0];
  return next ? <PopupDialog key={next.id} popup={next} onClose={() => { if (!seen.isPending) seen.mutate(next.id); }} /> : null;
}

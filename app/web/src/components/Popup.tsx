import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
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

const TONE = { info: { icon: Info, bg: "var(--info-soft)" }, warn: { icon: AlertTriangle, bg: "var(--warn-soft)" }, ok: { icon: CheckCircle2, bg: "var(--ok-soft)" } } as const;

export function PopupBlocks({ blocks }: { blocks: PopupBlock[] }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": return <h3 key={i} style={{ fontSize: "1.05rem" }}>{b.text}</h3>;
          case "text": return <p key={i} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{b.text}</p>;
          case "list": return <ul key={i} style={{ paddingLeft: 20, display: "grid", gap: 4 }}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>;
          case "callout": {
            const { icon: Icon, bg } = TONE[b.tone];
            return <div key={i} role="note" style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius)", background: bg }}><Icon size={18} style={{ flex: "none", marginTop: 2 }} aria-hidden /><span style={{ whiteSpace: "pre-wrap" }}>{b.text}</span></div>;
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

export function PopupDialog({ popup, onClose, closeLabel = "Mengerti" }: { popup: Pick<PopupDTO, "title" | "blocks">; onClose: () => void; closeLabel?: string }) {
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={popup.title}>
        <div className="dialog-h"><h2>{popup.title}</h2><button className="iconbtn" onClick={onClose} aria-label="Tutup"><X size={16} /></button></div>
        <div className="dialog-b"><PopupBlocks blocks={popup.blocks} /></div>
        <div className="dialog-f"><button className="btn" onClick={onClose} autoFocus>{closeLabel}</button></div>
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

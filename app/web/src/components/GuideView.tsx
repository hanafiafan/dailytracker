import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ClipboardList, Clock, Crown, CalendarOff, MessageSquare, ScrollText, ShieldCheck, Sparkles, Sun, Users, Eye } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { GUIDE_VERSION } from "@shared/schemas";
import type { GuideRole } from "@shared/policy";
import { api, ok } from "../lib/api";
import { fmtShort } from "../lib/format";
import { GUIDE, type Icon } from "../lib/guide";
import { errorText, keys } from "../lib/queries";
import { ymd } from "@shared/time";

const ICON: Record<Icon, typeof Sun> = { sun: Sun, check: CheckCheck, clock: Clock, chat: MessageSquare, leave: CalendarOff, spark: Sparkles, assign: ClipboardList, watch: Eye, approve: ShieldCheck, team: Users, crown: Crown, terms: ScrollText };

/** The guide for one role: a short summary, a table of contents, then one card per topic. */
export function GuideView({ role, compact }: { role: GuideRole; compact?: boolean }) {
  const g = GUIDE[role];
  return (
    <div className={"guide" + (compact ? " compact" : "")}>
      <header className="guide-hero">
        <span className="guide-badge">{g.label}</span>
        <p>{g.intro}</p>
        <ul>{g.highlights.map(h => <li key={h}><Check size={14} />{h}</li>)}</ul>
      </header>
      <div className="guide-body">
        <nav className="guide-toc" aria-label="Isi panduan">
          {g.sections.map((s, i) => { const I = ICON[s.icon]; return <a key={s.id} href={"#g-" + s.id} onClick={e => { e.preventDefault(); document.getElementById("g-" + s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><I size={15} /><span>{i + 1}. {s.h}</span></a>; })}
        </nav>
        <div className="guide-secs">
          {g.sections.map((s, i) => { const I = ICON[s.icon]; return (
            <section key={s.id} id={"g-" + s.id} className={"guide-sec" + (s.id === "ketentuan" ? " terms" : "")}>
              <h2><span className="gico"><I size={18} /></span><em>{i + 1}</em>{s.h}</h2>
              <ol>{s.items.map(t => <li key={t}>{t}</li>)}</ol>
              {s.tip && <p className="guide-tip">{s.tip}</p>}
            </section>); })}
        </div>
      </div>
    </div>
  );
}

/** "I have read everything and accept the terms" + confirm. `locked` keeps the box disabled until the person has scrolled to the end. */
export function AckForm({ locked, onDone }: { locked?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const [on, setOn] = useState(false), [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await ok(api.guide.ack.$post({ json: { version: GUIDE_VERSION } })); await qc.invalidateQueries({ queryKey: keys.me }); toast.success("Terima kasih, konfirmasimu tersimpan"); onDone?.(); }
    catch (e) { toast.error(errorText(e)); }
    setBusy(false);
  };
  return (
    <div className="ackform">
      <label className="check" style={{ opacity: locked ? .5 : 1 }}><input type="checkbox" checked={on} disabled={locked} onChange={e => setOn(e.target.checked)} />
        <span>Saya telah membaca seluruh panduan dan bersedia menjalankan sistem ini sesuai syarat dan ketentuan yang berlaku.</span></label>
      {locked && <small className="muted">Gulir sampai akhir panduan untuk mengaktifkan kotak ini.</small>}
      <button className="btn primary" disabled={!on || busy || locked} onClick={submit}>{busy ? "Menyimpan…" : "Konfirmasi"}</button>
    </div>
  );
}

/** Blocks the app after first sign-in (and after a guide update) until the guide for the person's role is read and confirmed. */
export function GuideGate({ role }: { role: GuideRole }) {
  const box = useRef<HTMLDivElement>(null);
  const [end, setEnd] = useState(false);
  const check = () => { const el = box.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) setEnd(true); };
  useEffect(() => { const t = setTimeout(check, 150); return () => clearTimeout(t); }, [role]);
  return (
    <>
      <div className="scrim" />
      <div className="dialog guidegate" role="dialog" aria-modal="true" aria-label="Panduan sistem">
        <div className="dialog-h"><div><h2>Panduan sistem untuk {GUIDE[role].label}</h2><p className="muted">Baca sampai akhir, lalu konfirmasi untuk mulai memakai aplikasi.</p></div></div>
        <div className="dialog-b" ref={box} onScroll={check}><GuideView role={role} compact /></div>
        <div className="dialog-f"><AckForm locked={!end} /></div>
      </div>
    </>
  );
}

export const ackedAt = (at: number) => fmtShort(ymd(new Date(at)));

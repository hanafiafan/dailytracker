import { useState } from "react";
import { api, ok } from "../lib/api";
import { keys, useAction, useLinks } from "../lib/queries";
import { ConfirmButton } from "./ui";

/** Shared shortcuts (trackers, spreadsheets) for the owner and admins. */
export function Links() {
  const q = useLinks(true);
  const [open, setOpen] = useState(false);
  const add = useAction((f: FormData) => ok(api.links.$post({ json: { title: String(f.get("title")), url: String(f.get("url")) } })), { done: "Tautan disimpan", refresh: [keys.links] });
  const del = useAction((id: string) => ok(api.links[":id"].$delete({ param: { id } })), { refresh: [keys.links] });
  const list = q.data ?? [];
  if (!list.length && !open) return <div className="links"><button className="linkbtn" onClick={() => setOpen(true)}>+ Tambah tautan admin</button></div>;
  return (
    <div className="links">
      <span className="foot">Tautan:</span>
      {list.map(l => (
        <span key={l.id} className="rt routines" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title} ↗</a>
          <ConfirmButton className="linkbtn" ariaLabel={"Hapus tautan " + l.title} label="×" armed="Hapus?" onConfirm={() => del.mutate(l.id)} />
        </span>
      ))}
      {open
        ? <form className="quick" style={{ flex: "1 1 100%" }} onSubmit={e => { e.preventDefault(); const form = e.currentTarget; add.mutate(new FormData(form), { onSuccess: () => { form.reset(); setOpen(false); } }); }}>
            <input className="input" name="title" placeholder="Nama tautan" maxLength={80} required />
            <input className="input" name="url" type="url" placeholder="https://…" maxLength={500} required />
            <button className="btn small" type="submit">Simpan</button><button className="btn small ghost" type="button" onClick={() => setOpen(false)}>Batal</button>
          </form>
        : <button className="linkbtn" onClick={() => setOpen(true)}>+ Tambah</button>}
    </div>
  );
}

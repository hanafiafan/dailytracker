import { useState, type FormEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MemberDTO } from "@shared/schemas";
import { api, ok, putImage } from "../lib/api";
import { fmtShort } from "../lib/format";
import { squarePhoto } from "../lib/image";
import { errorText, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { Avatar, ConfirmButton } from "./ui";
import { ymd } from "@shared/time";

const units = (team: MemberDTO[]) => [...new Set(team.map(m => m.group).filter(Boolean))].sort();

function UnitField({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const { team, policy } = useViewer();
  if (!policy.isBoss) return <label className="field"><span>Unit</span><select className="input" name={name} defaultValue={defaultValue || policy.groups[0]}>{policy.groups.map(g => <option key={g}>{g}</option>)}</select></label>;
  return <label className="field"><span>Unit (mis. HCS, HCM)</span>
    <input className="input" name={name} list="unit-list" maxLength={20} placeholder="Kosongkan kalau tidak ada" style={{ textTransform: "uppercase" }} defaultValue={defaultValue} />
    <datalist id="unit-list">{units(team).map(g => <option key={g} value={g} />)}</datalist></label>;
}

export function ProfileForm({ m, onClose }: { m: MemberDTO; onClose: () => void }) {
  const { me, policy } = useViewer();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null | undefined>(undefined); // undefined = unchanged, null = remove
  const self = m.email === me.email;
  const canAdmin = policy.isManager && !self;
  const save = useAction(async (f: FormData) => {
    const email = String(f.get("email") ?? m.email).trim().toLowerCase();
    const body: { name: string; role: string; group?: string } = { name: String(f.get("name")), role: String(f.get("role")) };
    if (canAdmin) body.group = String(f.get("group") ?? "").trim().toUpperCase();
    await ok(api.team[":email"].$patch({ param: { email: m.email }, json: body }));
    if (photo === null) await ok(api.team[":email"].photo.$delete({ param: { email: m.email } }));
    else if (photo) await putImage(`/api/team/${encodeURIComponent(m.email)}/photo`, photo.blob);
    if (canAdmin && email !== m.email) await ok(api.team[":email"].move.$post({ param: { email: m.email }, json: { email } }));
  }, { done: "Profil disimpan", refresh: [keys.team, keys.tasks, keys.me, keys.routines] });
  const preview = photo === undefined ? undefined : photo ? photo.url : null;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!String(f.get("name")).trim()) return void toast.error("Nama tidak boleh kosong");
    save.mutate(f, { onSuccess: () => { if (self) void qc.invalidateQueries({ queryKey: keys.me }); onClose(); } });
  };
  return (
    <form className="pform" onSubmit={submit}>
      <div className="prow">
        <Avatar m={m} big src={preview} />
        <div className="chips">
          <label className="btn small filebtn"><input type="file" accept="image/*" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const blob = await squarePhoto(f); setPhoto({ blob, url: URL.createObjectURL(blob) }); } catch { toast.error("Foto tidak bisa dibaca. Coba format JPG atau PNG."); }
          }} />{(preview ?? (photo === undefined && m.hasPhoto)) ? "Ganti foto" : "Tambah foto"}</label>
          {(preview || (photo === undefined && m.hasPhoto)) && <button type="button" className="btn small ghost" onClick={() => setPhoto(null)}>Hapus foto</button>}
        </div>
      </div>
      <div className="row">
        <label className="field"><span>Nama</span><input className="input" name="name" defaultValue={m.name} maxLength={40} autoFocus /></label>
        <label className="field"><span>Divisi</span><input className="input" name="role" defaultValue={m.role} maxLength={60} /></label>
        {canAdmin && <label className="field"><span>Email Google</span><input className="input" name="email" type="email" defaultValue={m.email} maxLength={120} /></label>}
        {canAdmin && <UnitField name="group" defaultValue={m.group} />}
      </div>
      <div className="actions"><button type="button" className="btn small ghost" onClick={onClose}>Batal</button><button type="submit" className="btn small primary" disabled={save.isPending}>Simpan profil</button></div>
    </form>
  );
}

function ScopeChips({ m }: { m: MemberDTO }) {
  const { team } = useViewer();
  const set = useAction((next: string[]) => ok(api.team[":email"].$patch({ param: { email: m.email }, json: { adminGroups: next } })), { done: "Cakupan admin disimpan" });
  const toggle = (g: string) => set.mutate(m.adminGroups.includes(g) ? m.adminGroups.filter(x => x !== g) : [...m.adminGroups, g]);
  return (
    <div className="scope"><span>Kelola:</span>
      <button className="chip" aria-pressed={!m.adminGroups.length} onClick={() => set.mutate([])}>Semua unit</button>
      {units(team).map(g => <button key={g} className="chip" aria-pressed={m.adminGroups.includes(g)} onClick={() => toggle(g)}>{g}</button>)}
    </div>
  );
}

function Row({ m, editing, onEdit }: { m: MemberDTO; editing: boolean; onEdit: (open: boolean) => void }) {
  const { me, team, policy } = useViewer();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.email });
  const toggleAdmin = useAction(() => ok(api.team[":email"].$patch({ param: { email: m.email }, json: { isAdmin: !m.isAdmin } })), { done: m.isAdmin ? `${m.name} bukan admin lagi` : `${m.name} sekarang admin` });
  const remove = useAction(() => ok(api.team[":email"].$delete({ param: { email: m.email } })), { done: `${m.name} dihapus dari tim` });
  const self = m.email === me.email;
  return (
    <>
      <div ref={setNodeRef} className={"mrow" + (isDragging ? " dragging" : "")} style={{ transform: CSS.Translate.toString(transform), transition }}>
        <button className="handle" type="button" aria-label={`Geser ${m.name}. Pakai spasi lalu panah atas atau bawah.`} title="Tarik untuk memindah" {...attributes} {...listeners}>⠿</button>
        <Avatar m={m} />
        <div className="who"><b>{m.name}</b><small>{m.role || "—"}</small><small>{m.email}</small></div>
        {m.group && <span className="tag due">{m.group}</span>}
        {m.isAdmin && <span className="tag rut">{m.adminGroups.length ? "Admin " + m.adminGroups.join("/") : "Admin penuh"}</span>}
        {m.seenAt ? <span className="tag on" title={"Terakhir buka " + fmtShort(ymd(new Date(m.seenAt)))}>Sudah masuk</span> : <span className="tag off">Belum masuk</span>}
        {policy.isBoss && !self && <button className="btn small" onClick={() => toggleAdmin.mutate()}>{m.isAdmin ? "Cabut admin" : "Jadikan admin"}</button>}
        <button className="btn small" onClick={() => onEdit(!editing)}>{editing ? "Tutup" : "Ubah"}</button>
        {!self && <ConfirmButton className="btn small danger" label="Hapus" armed="Yakin hapus?" onConfirm={() => remove.mutate()} />}
        {policy.isBoss && m.isAdmin && !self && units(team).length > 0 && <ScopeChips m={m} />}
      </div>
      {editing && <ProfileForm m={m} onClose={() => onEdit(false)} />}
    </>
  );
}


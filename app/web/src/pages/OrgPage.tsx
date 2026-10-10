import { useMemo, useState } from "react";
import type { MemberDTO } from "@shared/schemas";
import { Avatar, PersonLink } from "../components/ui";
import { fmtShort, today } from "../lib/format";
import { awayOn } from "../lib/leaves";
import { useLeaves, useMeta, useTasks } from "../lib/queries";
import { addDays } from "@shared/time";
import { useViewer } from "../lib/viewer";

type Level = "owner" | "head" | "member";
const LEVEL: Record<Level, string> = { owner: "Superadmin", head: "Atasan", member: "Anggota" };

interface Person { key: string; name: string; role: string; level: Level; unit: string; m?: MemberDTO; reports: string; kids: Person[] }

/** The chart follows each person's "atasan langsung". Without one, a person reports to the head of their unit, otherwise to the owner (the only root). */
function useOrg() {
  const { team, me } = useViewer();
  const owner = useMeta(true).data?.owner;
  return useMemo(() => {
    const ownerM = owner ? team.find(m => m.email === owner.email) : undefined;
    const root: Person = { key: owner?.email ?? "root", name: ownerM?.name ?? owner?.name ?? "Superadmin", role: ownerM?.role || "Superadmin aplikasi", level: "owner", unit: "", m: ownerM, reports: "—", kids: [] };
    const nodes = new Map<string, Person>(team.filter(m => m.email !== ownerM?.email).map(m => [m.email, { key: m.email, name: m.name, role: m.role, level: "member", unit: m.group, m, reports: root.name, kids: [] }]));
    const parentOf = (m: MemberDTO): string | null => {
      if (m.managerEmail && m.managerEmail !== m.email && (nodes.has(m.managerEmail) || m.managerEmail === ownerM?.email)) return m.managerEmail;
      const head = m.group ? team.find(h => h.email !== m.email && h.isAdmin && h.adminGroups.includes(m.group)) : undefined;
      return head && head.email !== ownerM?.email ? head.email : null;
    };
    const direct = new Map(team.filter(m => m.email !== ownerM?.email).map(m => [m.email, parentOf(m)]));
    const parents = new Map<string, string | null>();
    for (const [email, p] of direct) {
      let cur = p, hops = 0;
      while (cur && cur !== email && hops++ < 60) cur = direct.get(cur) ?? null;
      parents.set(email, cur === email || hops >= 60 ? null : p); // a reporting loop falls back to the root
    }
    for (const [email, node] of nodes) {
      const p = parents.get(email) ?? null, up = p ? nodes.get(p) : undefined;
      node.reports = up?.name ?? root.name;
      (up ?? root).kids.push(node);
    }
    const mark = (p: Person) => { p.kids.sort((a, b) => (a.m?.sortOrder ?? 999) - (b.m?.sortOrder ?? 999)); p.kids.forEach(mark); if (p.level !== "owner" && p.kids.length) p.level = "head"; };
    mark(root);
    const flat: Person[] = [];
    const walk = (p: Person) => { flat.push(p); p.kids.forEach(walk); };
    walk(root);
    return { root, flat, me: me.email };
  }, [team, owner, me.email]);
}

function Node({ p, open }: { p: Person; open?: number }) {
  const away = !!p.m && !!awayOn(useLeaves(true).data ?? [], p.m.email, today());
  return (
    <div className={"onode " + p.level}>
      {p.m ? <Avatar m={p.m} /> : <span className="avatar">{p.name[0]}</span>}
      <div style={{ minWidth: 0 }}><b className="clamp1" title={p.name}>{p.m ? <PersonLink email={p.m.email}>{p.name}</PersonLink> : p.name}</b><small className="clamp1" title={p.role}>{p.role || LEVEL[p.level]}</small></div>
      {away && <span className="ocnt" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>Cuti</span>}
      {!away && open !== undefined && <span className="ocnt" title="Tugas belum selesai">{open}</span>}
    </div>
  );
}

function Branch({ p, openOf, top }: { p: Person; openOf: (e?: string) => number | undefined; top?: boolean }) {
  return (
    <li className={top ? "otree-top" : undefined}>
      <Node p={p} open={openOf(p.m?.email)} />
      {p.kids.length > 0 && <ul className="otree">{p.kids.map(k => <Branch key={k.key} p={k} openOf={openOf} />)}</ul>}
    </li>
  );
}

export function OrgView() {
  const { policy } = useViewer();
  const org = useOrg();
  const [tab, setTab] = useState("bagan"), [unit, setUnit] = useState(""), [q, setQ] = useState("");
  const tq = useTasks(addDays(today(), -30), policy.isManager);
  const openOf = (email?: string) => policy.isManager && email ? (tq.data ?? []).filter(t => t.email === email && t.status !== "done").length : undefined;
  const units = [...new Set(org.flat.map(p => p.unit).filter(Boolean))].sort();
  const rows = org.flat.filter(p => (!unit || p.unit === unit) && (!q.trim() || (p.name + " " + p.role).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <div className="seg" role="group" aria-label="Tampilan struktur" style={{ justifySelf: "start" }}>
        <button aria-pressed={tab === "bagan"} onClick={() => setTab("bagan")}>Bagan</button><button aria-pressed={tab === "tabel"} onClick={() => setTab("tabel")}>Tabel</button>
      </div>
      {tab === "bagan" ? (
        <section className="bc"><div className="heatwrap"><ul className="otree otree-root"><Branch p={org.root} openOf={openOf} top /></ul></div></section>
      ) : (
        <section className="bc">
          <div className="bc-h"><h2>Daftar anggota</h2>
            <select className="input" value={unit} onChange={e => setUnit(e.target.value)} aria-label="Unit" style={{ width: "auto" }}><option value="">Semua unit</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
            <label className="searchbox"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau jabatan…" aria-label="Cari anggota" /></label></div>
          <div className="heatwrap"><table className="htable otable">
            <thead><tr><th>Nama</th><th>Jabatan</th><th>Unit</th><th>Peran</th><th>Atasan</th>{policy.isManager && <th style={{ textAlign: "right" }}>Tugas aktif</th>}<th>Terakhir masuk</th></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.key}>
                <td><span className="nm">{p.m ? <Avatar m={p.m} /> : <span className="avatar">{p.name[0]}</span>}<b>{p.name}</b></span></td>
                <td>{p.role || "—"}</td><td>{p.unit || "—"}</td><td><span className={"stpill " + (p.level === "member" ? "" : p.level === "head" ? "doing" : "done")}>{LEVEL[p.level]}</span></td>
                <td>{p.reports}</td>{policy.isManager && <td style={{ textAlign: "right", fontWeight: 700 }}>{openOf(p.m?.email) ?? "—"}</td>}
                <td className="muted">{p.m?.seenAt ? fmtShort(new Date(p.m.seenAt).toISOString().slice(0, 10)) : "Belum pernah"}</td>
              </tr>))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

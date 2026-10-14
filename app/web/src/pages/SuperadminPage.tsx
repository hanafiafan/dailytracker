import { useState, useMemo } from "react";
import {
  ShieldAlert, ShieldCheck, Users, FolderKanban, ListChecks,
  Building2, Activity, Check, X, Pencil, Plus, Trash2, ArrowUpRight,
  Search, SlidersHorizontal, Lock, CheckCircle2, Clock, AlertCircle, FileText
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS, type Color, type MemberDTO, type EntityDTO, type AdminOverviewDTO } from "@shared/schemas";
import { Page } from "../components/Page";
import { Avatar, Empty, ConfirmButton } from "../components/ui";
import { ProfileForm } from "../components/ManageTeam";
import { useAdminOverview, useAdminAudit, keys, useAction } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { api, ok } from "../lib/api";
import { fmtTime } from "../lib/format";
import { COLOR_LABEL, colorLabel } from "../lib/tasks";
import { ColorPicker } from "../components/ColorPicker";

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "baru saja" : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.floor(m / 60)} jam lalu` : `${Math.floor(m / 1440)} hari lalu`;
};

export function SuperadminPage() {
  const { me, team, policy, entities, projects } = useViewer();
  const [tab, setTab] = useState<"overview" | "permissions" | "entities" | "audit">("overview");
  const qc = useQueryClient();

  const overviewQ = useAdminOverview(policy.isSuper);
  const auditQ = useAdminAudit(policy.isSuper && tab === "audit");

  const [editingMember, setEditingMember] = useState<MemberDTO | null>(null);

  // Direct toggle actions for fast permissions management
  const togglePermission = useAction(async (v: { email: string; patch: Partial<MemberDTO> }) => {
    await ok(api.team[":email"].$patch({ param: { email: v.email }, json: v.patch }));
    await qc.invalidateQueries({ queryKey: keys.team });
    await qc.invalidateQueries({ queryKey: keys.admin });
  }, { done: "Izin berhasil diperbarui" });

  if (!policy.isSuper) {
    return (
      <Page noNew title="Akses Ditolak" sub="Khusus Superadmin">
        <div className="bc">
          <Empty art="tasks" title="Halaman Khusus Superadmin">
            Halaman ini hanya dapat diakses oleh Superadmin utama sistem.
          </Empty>
        </div>
      </Page>
    );
  }

  const counts = overviewQ.data?.counts;

  return (
    <Page
      noNew
      title="Pusat Kontrol Superadmin"
      sub={`Superadmin: ${me.name} (${me.email}) · Kendali penuh sistem, hak akses, entitas, dan audit`}
      tabs={[
        { id: "overview", label: "Ringkasan Sistem" },
        { id: "permissions", label: `Matriks Izin (${team.length})` },
        { id: "entities", label: `Entitas & Divisi (${entities?.length ?? 0})` },
        { id: "audit", label: "Audit Aktivitas" },
      ]}
      tab={tab}
      onTab={t => setTab(t as typeof tab)}
    >
      {tab === "overview" && (
        <OverviewSection counts={counts} entityCounts={overviewQ.data?.entityCounts ?? {}} team={team} projects={projects} />
      )}

      {tab === "permissions" && (
        <PermissionsMatrixSection
          team={team}
          onEdit={m => setEditingMember(m)}
          onToggle={(email, patch) => togglePermission.mutate({ email, patch })}
        />
      )}

      {tab === "entities" && (
        <EntitiesManagementSection entities={entities ?? []} team={team} />
      )}

      {tab === "audit" && (
        <AuditLogSection data={auditQ.data ?? []} isLoading={auditQ.isLoading} />
      )}

      {editingMember && (
        <>
          <div className="scrim" onClick={() => setEditingMember(null)} />
          <div className="dialog" role="dialog" aria-label="Edit Profil Anggota">
            <div className="dialog-h">
              <div>
                <h2>Edit Izin & Profil Anggota</h2>
                <p className="muted">{editingMember.name} · {editingMember.email}</p>
              </div>
              <button className="iconbtn" onClick={() => setEditingMember(null)} aria-label="Tutup"><X size={16} /></button>
            </div>
            <div className="dialog-b">
              <ProfileForm m={editingMember} onClose={() => setEditingMember(null)} />
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function OverviewSection({
  counts,
  entityCounts,
  team,
  projects,
}: {
  counts?: AdminOverviewDTO["counts"];
  entityCounts: Record<string, number>;
  team: MemberDTO[];
  projects: any[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stat Cards Grid */}
      <div className="gantt-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        <div className="surface" style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: ".82rem", fontWeight: 600 }}>Total Personil</span>
            <Users size={18} style={{ color: "var(--blue)" }} />
          </div>
          <b style={{ fontSize: "1.8rem", display: "block" }}>{counts?.totalMembers ?? team.length}</b>
          <small className="muted">{counts?.employees ?? 0} Karyawan · {counts?.clients ?? 0} Klien</small>
        </div>

        <div className="surface" style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: ".82rem", fontWeight: 600 }}>Proyek Terdaftar</span>
            <FolderKanban size={18} style={{ color: "var(--accent)" }} />
          </div>
          <b style={{ fontSize: "1.8rem", display: "block" }}>{counts?.totalProjects ?? projects.length}</b>
          <small className="muted">{counts?.activeProjects ?? 0} Aktif · {counts?.closedProjects ?? 0} Arsip/Selesai</small>
        </div>

        <div className="surface" style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: ".82rem", fontWeight: 600 }}>Tugas & Beban Kerja</span>
            <ListChecks size={18} style={{ color: "var(--good)" }} />
          </div>
          <b style={{ fontSize: "1.8rem", display: "block" }}>{counts?.totalTasks ?? 0}</b>
          <small className="muted">{counts?.doneTasks ?? 0} Selesai · {counts?.doingTasks ?? 0} Berjalan · {counts?.todoTasks ?? 0} Antrean</small>
        </div>

        <div className="surface" style={{ padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: ".82rem", fontWeight: 600 }}>Entitas & Unit Bisnis</span>
            <Building2 size={18} style={{ color: "#d97706" }} />
          </div>
          <b style={{ fontSize: "1.8rem", display: "block" }}>{counts?.totalEntities ?? 0}</b>
          <small className="muted">Divisi operasional mandiri</small>
        </div>
      </div>

      {/* Breakdown Section */}
      <div className="two" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <section className="surface" style={{ padding: "18px 20px" }}>
          <div className="surface-h" style={{ marginBottom: 12 }}>
            <h2>Distribusi Personil per Entitas</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(entityCounts).map(([unit, count]) => (
              <div key={unit} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--glass)", borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tag due" style={{ fontWeight: 700 }}>{unit}</span>
                  <span style={{ fontSize: ".88rem" }}>{unit === "HCS" ? "HAN Creative Studio" : unit === "HCM" ? "HAN Client Management" : unit === "HUC" ? "HAN Unit Corporate" : "Divisi Perusahaan"}</span>
                </div>
                <b>{count} orang</b>
              </div>
            ))}
          </div>
        </section>

        <section className="surface" style={{ padding: "18px 20px" }}>
          <div className="surface-h" style={{ marginBottom: 12 }}>
            <h2>Status & Keamanan Sistem</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".88rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--glass)", borderRadius: 8 }}>
              <span className="muted">Superadmin Utama</span>
              <b>Hellens (Pemilik)</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--glass)", borderRadius: 8 }}>
              <span className="muted">Total Pesan Obrolan</span>
              <b>{counts?.totalMessages ?? 0} pesan</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--glass)", borderRadius: 8 }}>
              <span className="muted">Personil Hak Buat Proyek</span>
              <b>{counts?.canCreateProjects ?? 0} orang</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--glass)", borderRadius: 8 }}>
              <span className="muted">Admin Penuh & Unit</span>
              <b>{counts?.admins ?? 0} orang</b>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PermissionsMatrixSection({
  team,
  onEdit,
  onToggle,
}: {
  team: MemberDTO[];
  onEdit: (m: MemberDTO) => void;
  onToggle: (email: string, patch: Partial<MemberDTO>) => void;
}) {
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<"all" | "admin" | "projectCreator" | "client">("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return team.filter(m => {
      if (filterType === "admin" && !m.isAdmin) return false;
      if (filterType === "projectCreator" && !m.canCreateProject && !m.isAdmin) return false;
      if (filterType === "client" && m.accountType !== "client") return false;
      if (!s) return true;
      return `${m.name} ${m.email} ${m.role} ${m.group} ${m.level}`.toLowerCase().includes(s);
    });
  }, [team, q, filterType]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Controls */}
      <div className="filter-bar" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ position: "relative", minWidth: 260, flex: "1 1 300px" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            className="input"
            type="search"
            placeholder="Cari personil, role, atau entitas..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ paddingLeft: 34, width: "100%" }}
          />
        </div>

        <div className="seg" role="group" aria-label="Filter hak akses">
          <button aria-pressed={filterType === "all"} onClick={() => setFilterType("all")}>Semua ({team.length})</button>
          <button aria-pressed={filterType === "projectCreator"} onClick={() => setFilterType("projectCreator")}>Bisa Buat Proyek</button>
          <button aria-pressed={filterType === "admin"} onClick={() => setFilterType("admin")}>Admin</button>
          <button aria-pressed={filterType === "client"} onClick={() => setFilterType("client")}>Klien</button>
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="surface" style={{ overflow: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <table className="ptable" style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr style={{ background: "var(--glass)", borderBottom: "1px solid var(--border)", textAlign: "left", fontSize: ".82rem" }}>
              <th style={{ padding: "12px 14px" }}>Personil & Jabatan</th>
              <th style={{ padding: "12px 14px" }}>Entitas</th>
              <th style={{ padding: "12px 14px" }}>Level</th>
              <th style={{ padding: "12px 14px" }}>Tipe Akun</th>
              <th style={{ padding: "12px 14px", textAlign: "center" }}>Buat Proyek</th>
              <th style={{ padding: "12px 14px", textAlign: "center" }}>Komentar Semua</th>
              <th style={{ padding: "12px 14px", textAlign: "right" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.email} style={{ borderBottom: "1px solid var(--border)", fontSize: ".88rem" }}>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar m={m} />
                    <div style={{ minWidth: 0 }}>
                      <b style={{ display: "block" }}>{m.name}</b>
                      <small className="muted clamp1">{m.role || "Anggota Tim"} · {m.email}</small>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {m.group ? <span className="tag due" style={{ fontWeight: 700 }}>{m.group}</span> : <span className="muted">—</span>}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span className="tag proj">{m.level || "Staff"}</span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <button
                    className={"btn small " + (m.accountType === "client" ? "ghost" : "")}
                    style={{ fontSize: ".76rem", padding: "3px 8px" }}
                    onClick={() => onToggle(m.email, { accountType: m.accountType === "client" ? "employee" : "client" })}
                    title="Klik untuk ganti tipe akun"
                  >
                    {m.accountType === "client" ? "Klien" : "Karyawan"}
                  </button>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <button
                    className={"chip " + (m.canCreateProject || m.isAdmin ? "on" : "")}
                    style={{ padding: "4px 10px", fontSize: ".76rem", cursor: m.isAdmin ? "default" : "pointer" }}
                    onClick={() => !m.isAdmin && onToggle(m.email, { canCreateProject: !m.canCreateProject })}
                    title={m.isAdmin ? "Admin otomatis memiliki hak buat proyek" : "Klik untuk mengubah izin"}
                  >
                    {m.isAdmin || m.canCreateProject ? "Aktif" : "Nonaktif"}
                  </button>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <button
                    className={"chip " + (m.canCommentAllProjects || m.isAdmin ? "on" : "")}
                    style={{ padding: "4px 10px", fontSize: ".76rem", cursor: m.isAdmin ? "default" : "pointer" }}
                    onClick={() => !m.isAdmin && onToggle(m.email, { canCommentAllProjects: !m.canCommentAllProjects })}
                    title={m.isAdmin ? "Admin otomatis memiliki hak komentar" : "Klik untuk mengubah izin"}
                  >
                    {m.isAdmin || m.canCommentAllProjects ? "Bebas" : "Terbatas"}
                  </button>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  <button className="btn small" onClick={() => onEdit(m)}>
                    <Pencil size={13} style={{ marginRight: 4 }} /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "30px 0" }}>
                  <span className="muted">Tidak ada personil yang cocok dengan kriteria pencarian.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntitiesManagementSection({ entities, team }: { entities: EntityDTO[]; team: MemberDTO[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EntityDTO | null>(null);
  const qc = useQueryClient();

  const addEntity = useAction(async (f: FormData) => {
    const id = String(f.get("id")).trim().toUpperCase();
    const name = String(f.get("name")).trim();
    const description = String(f.get("description") ?? "").trim();
    const color = (String(f.get("color") ?? "blue") as Color);
    if (!id || !name) return toast.error("Kode dan Nama entitas wajib diisi");
    await ok(api.meta.entities.$post({ json: { id, name, description, color } }));
    await qc.invalidateQueries({ queryKey: keys.meta });
  }, { done: "Entitas baru berhasil dibuat" });

  const patchEntity = useAction(async (f: FormData) => {
    if (!editing) return;
    const name = String(f.get("name")).trim();
    const description = String(f.get("description") ?? "").trim();
    const color = (String(f.get("color") ?? "blue") as Color);
    await ok(api.meta.entities[":id"].$patch({ param: { id: editing.id }, json: { name, description, color } }));
    await qc.invalidateQueries({ queryKey: keys.meta });
    setEditing(null);
  }, { done: "Entitas berhasil diperbarui" });

  const deleteEntity = useAction(async (id: string) => {
    await ok(api.meta.entities[":id"].$delete({ param: { id } }));
    await qc.invalidateQueries({ queryKey: keys.meta });
  }, { done: "Entitas dihapus" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Daftar Entitas & Divisi Operasional</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: ".85rem" }}>
            Entitas memisahkan penugasan dan pengelompokan kerja (misal: HCS, HCM, HUC).
          </p>
        </div>
        <button className="btn small primary" onClick={() => setAdding(true)}>
          <Plus size={15} style={{ marginRight: 4 }} /> Tambah Entitas Baru
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {entities.map(e => {
          const membersInUnit = team.filter(m => m.group === e.id);
          return (
            <div key={e.id} className="surface" style={{ padding: "18px 20px", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="tag due" style={{ fontSize: ".9rem", fontWeight: 800 }}>{e.id}</span>
                  <div className="chips">
                    <button className="btn small ghost" onClick={() => setEditing(e)}><Pencil size={13} /></button>
                    <ConfirmButton className="btn small ghost" label="Hapus" armed="Yakin hapus?" onConfirm={() => deleteEntity.mutate(e.id)} />
                  </div>
                </div>
                <b style={{ fontSize: "1.05rem", display: "block", marginBottom: 4 }}>{e.name}</b>
                <p className="muted clamp2" style={{ fontSize: ".85rem", marginBottom: 12 }}>{e.description || "Tanpa deskripsi"}</p>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: ".8rem" }}>{membersInUnit.length} anggota tim</span>
                <span className="tag proj" data-c={e.color}>{colorLabel(e.color)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Entity Dialog */}
      {adding && (
        <>
          <div className="scrim" onClick={() => setAdding(false)} />
          <div className="dialog" role="dialog" aria-label="Tambah Entitas">
            <div className="dialog-h">
              <h2>Tambah Entitas Baru</h2>
              <button className="iconbtn" onClick={() => setAdding(false)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); addEntity.mutate(new FormData(e.currentTarget), { onSuccess: () => setAdding(false) }); }}>
              <div className="dialog-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="field"><span>Kode Entitas (misal: HCS, HCM, ADS)</span><input className="input" name="id" required maxLength={10} placeholder="HCS" autoFocus /></label>
                <label className="field"><span>Nama Lengkap Entitas</span><input className="input" name="name" required maxLength={60} placeholder="HAN Creative Studio" /></label>
                <label className="field"><span>Deskripsi</span><input className="input" name="description" maxLength={200} placeholder="Fokus pada layanan konten visual dan branding..." /></label>
                <label className="field"><span>Warna Identitas</span>
                  <ColorPicker name="color" defaultValue="blue" />
                </label>
              </div>
              <footer className="dialog-f">
                <button type="submit" className="btn primary" disabled={addEntity.isPending}>Simpan Entitas</button>
                <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Batal</button>
              </footer>
            </form>
          </div>
        </>
      )}

      {/* Edit Entity Dialog */}
      {editing && (
        <>
          <div className="scrim" onClick={() => setEditing(null)} />
          <div className="dialog" role="dialog" aria-label="Edit Entitas">
            <div className="dialog-h">
              <h2>Edit Entitas {editing.id}</h2>
              <button className="iconbtn" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); patchEntity.mutate(new FormData(e.currentTarget)); }}>
              <div className="dialog-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="field"><span>Nama Lengkap Entitas</span><input className="input" name="name" defaultValue={editing.name} required maxLength={60} /></label>
                <label className="field"><span>Deskripsi</span><input className="input" name="description" defaultValue={editing.description} maxLength={200} /></label>
                <label className="field"><span>Warna Identitas</span>
                  <ColorPicker name="color" defaultValue={editing.color} />
                </label>
              </div>
              <footer className="dialog-f">
                <button type="submit" className="btn primary" disabled={patchEntity.isPending}>Perbarui</button>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Batal</button>
              </footer>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function AuditLogSection({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter(a => `${a.actorName} ${a.actorEmail} ${a.text} ${a.taskTitle}`.toLowerCase().includes(s));
  }, [data, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Audit Trail Aktivitas Sistem</h2>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: ".85rem" }}>
            Catatan kronologis seluruh tindakan penting (pembuatan tugas, penyelesaian, penutupan proyek, izin, perubahan profil).
          </p>
        </div>
        <div style={{ position: "relative", minWidth: 260 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input
            className="input"
            type="search"
            placeholder="Cari log atau aktor..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ paddingLeft: 34, width: "100%" }}
          />
        </div>
      </div>

      <div className="surface" style={{ padding: "8px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <ul className="alist" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {filtered.map(a => (
            <li key={a.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ padding: "6px", background: "var(--glass)", borderRadius: 8, marginTop: 2 }}>
                <Activity size={16} style={{ color: "var(--blue)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".88rem", lineHeight: 1.4 }}>
                  <b>{a.actorName}</b> <span className="muted">({a.actorEmail})</span> {a.text}
                  {a.taskTitle && <span style={{ fontWeight: 600, color: "var(--accent)" }}>: "{a.taskTitle}"</span>}
                </div>
                <small className="muted" style={{ fontSize: ".76rem", marginTop: 2, display: "block" }}>
                  {fmtTime(a.at)} · {ago(a.at)} lalu
                </small>
              </div>
            </li>
          ))}
          {!filtered.length && !isLoading && (
            <li style={{ padding: "30px 0", textAlign: "center" }}>
              <span className="muted">Tidak ada catatan audit yang cocok.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

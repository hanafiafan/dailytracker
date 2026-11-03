import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2, Users, FolderKanban, CheckCircle2, AlertTriangle, Search,
  Plus, Pencil, Trash2, X, Check, Briefcase, ExternalLink, Layers, Sparkles,
  ChevronDown, ChevronUp, Clock, AlertCircle, MessageSquare, Zap
} from "lucide-react";
import type { Color, EntityDTO, ProjectDTO } from "@shared/schemas";
import { unitsOf } from "@shared/policy";
import { Page } from "../components/Page";
import { Avatar, Empty, ConfirmButton } from "../components/ui";
import { ColorPicker } from "../components/ColorPicker";
import { ProjectSetup } from "../components/ProjectSetup";
import { api, ok } from "../lib/api";
import { keys, useAction, useMeta } from "../lib/queries";
import { useViewer } from "../lib/viewer";
import { brandOf, HEALTH_LABEL, pct, calcPace, type Health } from "../lib/projects";
import { COLOR_LABEL } from "../lib/tasks";
import { today } from "../lib/format";

const SERVICE_PRESETS = [
  "Social Media Management",
  "Web Development",
  "Branding & Identity",
  "Foto & Video Produk",
  "Digital Marketing & Ads",
  "SEO & Copywriting",
  "UI/UX Design",
  "Content Production",
];

export function BrandPage() {
  const { entities, projects, member, policy, team } = useViewer();
  const metaQ = useMeta(true);
  const projectStats = metaQ.data?.projectStats ?? {};
  const [, go] = useLocation();
  const qc = useQueryClient();

  const [pick, setPick] = useState("");
  const [subTab, setSubTab] = useState<"clients" | "projects" | "services" | "team">("clients");
  const [clientFilter, setClientFilter] = useState<"all" | "active" | "history">("all");
  const [clientSearch, setClientSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"all" | "live" | "done">("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [showNoClientAlert, setShowNoClientAlert] = useState(false);
  const [editingBrand, setEditingBrand] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newServiceInput, setNewServiceInput] = useState("");
  const [bulkEditServices, setBulkEditServices] = useState<string | null>(null);

  const brand = entities.find(e => e.id === pick) ?? entities[0];

  // Action to patch brand profile (name, description, color, services)
  const saveBrand = useAction(
    async (patch: { id: string; name?: string; description?: string; color?: Color; services?: string[] }) => {
      await ok(api.meta.entities[":id"].$patch({ param: { id: patch.id }, json: patch }));
      await qc.invalidateQueries({ queryKey: keys.meta });
      await qc.invalidateQueries({ queryKey: keys.team });
    },
    { done: "Profil brand berhasil disimpan", refresh: [keys.meta, keys.team] }
  );

  // Computed brand data
  const data = useMemo(() => {
    if (!brand) return null;
    const ids = entities.map(e => e.id);
    const mine = projects.filter(p => brandOf(p, member, ids) === brand.id);
    const live = (p: ProjectDTO) => !p.closedAt && !p.archived;
    const activeProjects = mine.filter(live);
    const closedProjects = mine.filter(p => !live(p));

    // Clients mapping
    const byClient = new Map<string, ProjectDTO[]>();
    for (const p of mine) {
      if (p.clientEmail) {
        byClient.set(p.clientEmail, [...(byClient.get(p.clientEmail) ?? []), p]);
      }
    }
    const clients = [...byClient].map(([email, ps]) => ({
      email,
      ps,
      active: ps.some(live),
      since: Math.min(...ps.map(p => p.createdAt)),
    })).sort((a, b) => Number(b.active) - Number(a.active) || a.since - b.since);

    const noClientProjects = mine.filter(p => !p.clientEmail);

    // Task aggregates across this brand's projects
    let brandTotalTasks = 0;
    let brandDoneTasks = 0;
    for (const p of mine) {
      const st = projectStats[p.id];
      if (st) {
        brandTotalTasks += st.total;
        brandDoneTasks += st.done;
      }
    }
    const brandTaskPct = pct(brandDoneTasks, brandTotalTasks);

    // Team members in this unit + active PMs
    const brandMembers = team.filter(m => unitsOf(m).includes(brand.id));
    const brandPms = [...new Set(mine.map(p => p.pmEmail).filter(Boolean))] as string[];

    return {
      mine,
      live,
      activeProjects,
      closedProjects,
      clients,
      noClientProjects,
      brandTotalTasks,
      brandDoneTasks,
      brandTaskPct,
      brandMembers,
      brandPms,
    };
  }, [brand, projects, entities, member, projectStats, team]);

  if (!brand || !data) {
    return (
      <Page title="Brand" sub="Belum ada brand">
        <div className="bc">
          <Empty art="tasks" title="Belum ada brand">
            Superadmin dapat menambah brand di menu Superadmin → Entitas.
          </Empty>
        </div>
      </Page>
    );
  }

  const {
    mine,
    live,
    activeProjects,
    closedProjects,
    clients,
    noClientProjects,
    brandTotalTasks,
    brandDoneTasks,
    brandTaskPct,
    brandMembers,
    brandPms,
  } = data;

  const activeN = clients.filter(c => c.active).length;
  const historyN = clients.length - activeN;

  // Filtered clients
  const filteredClients = clients.filter(c => {
    if (clientFilter === "active" && !c.active) return false;
    if (clientFilter === "history" && c.active) return false;
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      const m = member(c.email);
      const name = m?.name?.toLowerCase() ?? "";
      const email = c.email.toLowerCase();
      const hasProj = c.ps.some(p => p.name.toLowerCase().includes(q));
      if (!name.includes(q) && !email.includes(q) && !hasProj) return false;
    }
    return true;
  });

  // Filtered projects
  const filteredProjects = mine.filter(p => {
    if (projectFilter === "live" && !live(p)) return false;
    if (projectFilter === "done" && live(p)) return false;
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.description && p.description.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // Quick add single service
  const handleAddService = (name: string) => {
    const s = name.trim();
    if (!s) return;
    if (brand.services.includes(s)) {
      toast.info("Layanan sudah terdaftar");
      return;
    }
    saveBrand.mutate(
      { id: brand.id, services: [...brand.services, s] },
      { onSuccess: () => setNewServiceInput("") }
    );
  };

  // Remove single service
  const handleRemoveService = (serviceToRemove: string) => {
    saveBrand.mutate({
      id: brand.id,
      services: brand.services.filter(s => s !== serviceToRemove),
    });
  };

  // Helper to calculate project health
  const getProjectHealth = (p: ProjectDTO): Health => {
    if (p.closedAt) return "done";
    const st = projectStats[p.id];
    const todayStr = today();
    if (p.dueDate && p.dueDate < todayStr && (!st || st.done < st.total)) return "late";
    if (st && st.total > 0 && st.done === st.total) return "done";
    if (st && st.total > 0) return "ok";
    return "idle";
  };

  return (
    <Page
      title="Brand"
      sub="Pusat manajemen entitas, client aktif, proyek, dan katalog layanan per brand"
      tabs={entities.map(e => ({
        id: e.id,
        label: `${e.id} (${projects.filter(p => brandOf(p, member, entities.map(x => x.id)) === e.id).length})`,
      }))}
      tab={brand.id}
      onTab={setPick}
    >
      {/* 1. BRAND HERO HEADER */}
      <section className="brand-hero" data-c={brand.color}>
        <div className="brand-hero-top">
          <div className="brand-hero-identity">
            <div className="brand-monogram">
              <span>{brand.id}</span>
            </div>
            <div className="brand-hero-meta">
              <h2>{brand.name}</h2>
              <div className="brand-hero-badges">
                <span className="tag due" style={{ fontWeight: 800 }}>{brand.id}</span>
                <span className="tag proj" data-c={brand.color}>{COLOR_LABEL[brand.color] ?? brand.color}</span>
                <span className="tag">{mine.length} Proyek</span>
                <span className="tag">{clients.length} Klien</span>
                <span className="tag">{brandMembers.length} Tim</span>
              </div>
            </div>
          </div>

          <div className="brand-hero-actions">
            {policy.canCreateProject() && (
              <button className="btn small blue" onClick={() => setCreatingProject(true)}>
                <Plus size={15} /> Proyek Baru
              </button>
            )}
            {policy.canManageBrand() && (
              <button className="btn small ghost" onClick={() => setEditingBrand(true)}>
                <Pencil size={14} /> Ubah Brand
              </button>
            )}
          </div>
        </div>

        <p className="brand-hero-desc">
          {brand.description || "Belum ada deskripsi unit usaha. Anda dapat menambahkan ringkasan profil unit ini melalui tombol Ubah Brand."}
        </p>

        {/* 2. EXECUTIVE KPI CARDS */}
        <div className="brand-kpis">
          {/* KPI 1: Klien Aktif */}
          <div className="brand-kpi-card">
            <div className="brand-kpi-head">
              <span className="brand-kpi-title"><Users size={15} /> Klien Aktif</span>
              <span className="tag proj">{pct(activeN, clients.length)}% Aktif</span>
            </div>
            <div className="brand-kpi-num">
              {activeN}<small> / {clients.length}</small>
            </div>
            <div className="brand-kpi-footer">
              <span>{historyN} riwayat · {noClientProjects.length ? `${noClientProjects.length} proyek tanpa klien` : "Semua bertaut"}</span>
            </div>
          </div>

          {/* KPI 2: Proyek Berjalan */}
          <div className="brand-kpi-card">
            <div className="brand-kpi-head">
              <span className="brand-kpi-title"><FolderKanban size={15} /> Proyek Berjalan</span>
              <span className="tag due">{pct(activeProjects.length, mine.length)}% Berjalan</span>
            </div>
            <div className="brand-kpi-num">
              {activeProjects.length}<small> / {mine.length}</small>
            </div>
            <div className="brand-kpi-footer">
              <span>{closedProjects.length} proyek telah selesai</span>
            </div>
          </div>

          {/* KPI 3: Beban Tugas & Selesai */}
          <div className="brand-kpi-card">
            <div className="brand-kpi-head">
              <span className="brand-kpi-title"><CheckCircle2 size={15} /> Realisasi Tugas</span>
              <span className={"tag " + (brandTaskPct >= 80 ? "ok" : "due")}>{brandTaskPct}% Selesai</span>
            </div>
            <div className="brand-kpi-num">
              {brandDoneTasks}<small> / {brandTotalTasks}</small>
            </div>
            <div className="pj-bar" style={{ marginTop: 2 }}>
              <i style={{ width: `${brandTaskPct}%` }} />
            </div>
          </div>

          {/* KPI 4: Kekuatan Tim Operasional */}
          <div className="brand-kpi-card">
            <div className="brand-kpi-head">
              <span className="brand-kpi-title"><Briefcase size={15} /> Divisi & Tim</span>
              <span className="tag">{brandMembers.length} Personil</span>
            </div>
            <div className="brand-kpi-num">
              {brandMembers.length}<small> Anggota</small>
            </div>
            <div className="brand-kpi-footer">
              {brandMembers.length > 0 && (
                <span className="avatars" style={{ display: "inline-flex", marginRight: 4 }}>
                  {brandMembers.slice(0, 4).map(m => <Avatar key={m.email} m={m} />)}
                  {brandMembers.length > 4 && <span className="avatar sm">+{brandMembers.length - 4}</span>}
                </span>
              )}
              <span>{brandPms.length} Project Manager</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SUB-VIEW SEGMENTED NAVIGATION */}
      <nav className="brand-subnav" role="tablist" aria-label="Sub navigasi brand">
        <button
          role="tab"
          className="brand-tab-btn"
          aria-pressed={subTab === "clients"}
          onClick={() => setSubTab("clients")}
        >
          <Users size={16} /> Klien ({clients.length})
        </button>
        <button
          role="tab"
          className="brand-tab-btn"
          aria-pressed={subTab === "projects"}
          onClick={() => setSubTab("projects")}
        >
          <FolderKanban size={16} /> Daftar Proyek ({mine.length})
        </button>
        <button
          role="tab"
          className="brand-tab-btn"
          aria-pressed={subTab === "services"}
          onClick={() => setSubTab("services")}
        >
          <Layers size={16} /> Katalog Layanan ({brand.services.length})
        </button>
        <button
          role="tab"
          className="brand-tab-btn"
          aria-pressed={subTab === "team"}
          onClick={() => setSubTab("team")}
        >
          <Briefcase size={16} /> Tim & Personalia ({brandMembers.length})
        </button>
      </nav>

      {/* ======================================================== TAB 1: KLIEN CRM */}
      {subTab === "clients" && (
        <section className="bc">
          <div className="bc-h" style={{ flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: "1 1 280px" }}>
              <h2>Hubungan Klien ({clients.length})</h2>
              <div className="seg" role="group" aria-label="Filter status klien">
                <button aria-pressed={clientFilter === "all"} onClick={() => setClientFilter("all")}>
                  Semua ({clients.length})
                </button>
                <button aria-pressed={clientFilter === "active"} onClick={() => setClientFilter("active")}>
                  Aktif ({activeN})
                </button>
                <button aria-pressed={clientFilter === "history"} onClick={() => setClientFilter("history")}>
                  Riwayat ({historyN})
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="searchbox" style={{ width: 240, height: 34, background: "var(--canvas)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", padding: "0 10px", gap: 6, border: "1px solid var(--border)" }}>
                <Search size={14} className="muted" />
                <input
                  type="search"
                  placeholder="Cari nama klien / proyek..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  style={{ border: 0, background: "none", outline: "none", fontSize: ".82rem", width: "100%", color: "var(--ink)" }}
                />
                {clientSearch && <button type="button" onClick={() => setClientSearch("")} style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }}><X size={13} className="muted" /></button>}
              </div>
            </div>
          </div>

          {/* Attention banner if there are projects without client email */}
          {noClientProjects.length > 0 && (
            <div className="brand-alert-banner" style={{ margin: "14px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={18} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>
                  <b>{noClientProjects.length} proyek</b> brand ini belum ditautkan ke akun klien.
                </span>
              </div>
              <button
                className="btn small ghost"
                style={{ height: 28, fontSize: ".76rem" }}
                onClick={() => setShowNoClientAlert(v => !v)}
              >
                {showNoClientAlert ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showNoClientAlert ? "Sembunyikan proyek" : "Lihat proyek"}
              </button>

              {showNoClientAlert && (
                <div style={{ width: "100%", marginTop: 8, paddingTop: 8, borderTop: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)", display: "grid", gap: 6 }}>
                  <p className="muted" style={{ fontSize: ".78rem", margin: "0 0 6px" }}>
                    Menautkan akun klien memungkinkan klien Anda login dan melihat progress laporan proyek di portal mandiri mereka.
                  </p>
                  <div className="chips">
                    {noClientProjects.map(p => (
                      <button
                        key={p.id}
                        className="chip"
                        data-c={p.color}
                        onClick={() => go("/proyek/" + p.id)}
                        title="Klik untuk membuka proyek dan menambahkan akun klien"
                      >
                        {p.name} <ExternalLink size={12} style={{ marginLeft: 4 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clients List */}
          {filteredClients.length > 0 ? (
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {filteredClients.map(({ email, ps, active, since }) => {
                const m = member(email);
                // Aggregate tasks for this client
                let clientTasks = 0;
                let clientDone = 0;
                for (const p of ps) {
                  const st = projectStats[p.id];
                  if (st) {
                    clientTasks += st.total;
                    clientDone += st.done;
                  }
                }
                const progressPct = pct(clientDone, clientTasks);

                return (
                  <div key={email} className="brand-card-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 220 }}>
                        {m ? <Avatar m={m} big /> : <div className="avatar big" style={{ background: "var(--canvas)", color: "var(--ink)" }}>{(email[0] ?? "?").toUpperCase()}</div>}
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <b style={{ fontSize: ".98rem" }}>{m?.name ?? email}</b>
                            <span className={"pj-health " + (active ? "ok" : "done")}>
                              {active ? "Aktif" : "Riwayat"}
                            </span>
                          </div>
                          <small className="muted" style={{ display: "block", marginTop: 2 }}>
                            {email} · Sejak {new Date(since).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}
                          </small>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: ".82rem" }}>
                        <span className="muted">
                          <b>{ps.length}</b> proyek ({ps.filter(live).length} aktif)
                        </span>
                        {clientTasks > 0 && (
                          <span className="muted">
                            <b>{clientDone}/{clientTasks}</b> tugas ({progressPct}%)
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div className="chips" style={{ flex: 1, minWidth: 200 }}>
                        {ps.map(p => {
                          const health = getProjectHealth(p);
                          const isLive = live(p);
                          const st = projectStats[p.id];
                          const projPct = st ? pct(st.done, st.total) : 0;
                          return (
                            <button
                              key={p.id}
                              className={"chip" + (isLive ? "" : " muted")}
                              data-c={p.color}
                              onClick={() => go("/proyek/" + p.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                              title={`Health: ${HEALTH_LABEL[health]} · ${projPct}% selesai`}
                            >
                              <span>{p.name}</span>
                              <span className={"pj-health " + health} style={{ height: 18, padding: "0 6px", fontSize: ".65rem" }}>
                                {projPct}%
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {ps[0] && (
                        <button
                          className="btn small ghost"
                          style={{ height: 28, fontSize: ".76rem" }}
                          onClick={() => go("/proyek/" + ps[0]!.id)}
                        >
                          Buka Proyek <ExternalLink size={12} style={{ marginLeft: 4 }} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              art="tasks"
              title={clientSearch ? "Klien tidak ditemukan" : clientFilter === "history" ? "Belum ada riwayat klien" : "Belum ada klien"}
            >
              {clientSearch
                ? "Coba kata kunci pencarian yang lain."
                : "Tautkan akun klien saat membuat atau mengubah proyek brand ini agar tampil di sini."}
            </Empty>
          )}
        </section>
      )}

      {/* ======================================================== TAB 2: DAFTAR PROYEK */}
      {subTab === "projects" && (
        <section className="bc">
          <div className="bc-h" style={{ flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: "1 1 280px" }}>
              <h2>Daftar Proyek Brand {brand.id} ({mine.length})</h2>
              <div className="seg" role="group" aria-label="Filter status proyek">
                <button aria-pressed={projectFilter === "all"} onClick={() => setProjectFilter("all")}>
                  Semua ({mine.length})
                </button>
                <button aria-pressed={projectFilter === "live"} onClick={() => setProjectFilter("live")}>
                  Berjalan ({activeProjects.length})
                </button>
                <button aria-pressed={projectFilter === "done"} onClick={() => setProjectFilter("done")}>
                  Selesai ({closedProjects.length})
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="searchbox" style={{ width: 220, height: 34, background: "var(--canvas)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", padding: "0 10px", gap: 6, border: "1px solid var(--border)" }}>
                <Search size={14} className="muted" />
                <input
                  type="search"
                  placeholder="Cari proyek..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  style={{ border: 0, background: "none", outline: "none", fontSize: ".82rem", width: "100%", color: "var(--ink)" }}
                />
                {projectSearch && <button type="button" onClick={() => setProjectSearch("")} style={{ border: 0, background: "none", cursor: "pointer", padding: 0 }}><X size={13} className="muted" /></button>}
              </div>

              {policy.canCreateProject() && (
                <button className="btn small primary" onClick={() => setCreatingProject(true)}>
                  <Plus size={14} /> Tambah Proyek
                </button>
              )}
            </div>
          </div>

          {filteredProjects.length > 0 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {filteredProjects.map(p => {
                const isLive = live(p);
                const health = getProjectHealth(p);
                const st = projectStats[p.id];
                const projPct = st ? pct(st.done, st.total) : 0;
                const clientM = p.clientEmail ? member(p.clientEmail) : null;
                const pmM = p.pmEmail ? member(p.pmEmail) : null;
                const sv = st?.services ?? [], withT = sv.filter(x => x.target > 0);
                let paceText: string | null = null;
                if (withT.length > 0 && isLive) {
                  const units = [...new Set(withT.map(x => x.unit))];
                  if (units.length === 1) {
                    const totalT = withT.reduce((a, x) => a + x.target, 0), totalD = withT.reduce((a, x) => a + x.delivered, 0);
                    const pace = calcPace(totalT, totalD, units[0] ?? "", p.dueDate, today());
                    if (pace.paceText && totalT > totalD) paceText = pace.paceText;
                  } else {
                    const paces = withT.map(x => calcPace(x.target, x.delivered, x.unit, p.dueDate, today())).filter(x => x.needed > 0 && x.paceText);
                    if (paces.length) paceText = paces.map(x => x.paceText).join(" · ");
                  }
                }

                return (
                  <div
                    key={p.id}
                    className="brand-card-item"
                    data-c={p.color}
                    style={{
                      borderLeft: `4px solid var(--d, var(--c-${p.color}))`,
                      cursor: "pointer",
                    }}
                    onClick={() => go("/proyek/" + p.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <b style={{ fontSize: "1.02rem" }}>{p.name}</b>
                          <span className={"pj-health " + health}>
                            {HEALTH_LABEL[health]}
                          </span>
                          {!isLive && <span className="tag off">Selesai</span>}
                          {paceText && (
                            <span className="chip" style={{ background: "rgba(214, 244, 63, 0.18)", color: "var(--ink)", border: "1px solid rgba(214, 244, 63, 0.4)", fontWeight: 700, fontSize: ".72rem", padding: "1px 7px" }} title="Rekomendasi target harian">
                              <Zap size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                              {paceText}
                            </span>
                          )}
                        </div>
                        <p className="muted clamp1" style={{ fontSize: ".82rem", margin: "4px 0 0" }}>
                          {p.description || "Tanpa deskripsi"}
                        </p>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ textAlign: "right" }}>
                          <b style={{ fontSize: ".94rem" }}>{projPct}%</b>
                          <small className="muted" style={{ display: "block" }}>
                            {st ? `${st.done}/${st.total} tugas` : "0 tugas"}
                          </small>
                        </div>
                        <div className="pj-bar" style={{ width: 80, height: 8 }}>
                          <i style={{ width: `${projPct}%` }} />
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: ".8rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        {pmM && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <small className="muted">PM:</small>
                            <Avatar m={pmM} />
                            <span>{pmM.name}</span>
                          </div>
                        )}
                        {clientM ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <small className="muted">Klien:</small>
                            <Avatar m={clientM} />
                            <span>{clientM.name}</span>
                          </div>
                        ) : (
                          <span className="tag bad" style={{ fontSize: ".72rem" }}>
                            Belum ada akun klien
                          </span>
                        )}
                        {p.dueDate && (
                          <span className="muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={13} /> Tenggat: {p.dueDate}
                          </span>
                        )}
                      </div>

                      <span className="plink" style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                        Buka Proyek <ExternalLink size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty art="tasks" title={projectSearch ? "Proyek tidak ditemukan" : "Belum ada proyek"}>
              {projectSearch
                ? "Coba kata kunci pencarian yang lain."
                : "Klik tombol Tambah Proyek untuk memulai proyek baru di bawah brand ini."}
            </Empty>
          )}
        </section>
      )}

      {/* ======================================================== TAB 3: KATALOG LAYANAN */}
      {subTab === "services" && (
        <section className="bc">
          <div className="bc-h" style={{ flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2>Katalog Layanan Brand {brand.name}</h2>
              <p className="muted" style={{ fontSize: ".82rem", margin: "2px 0 0" }}>
                Jenis layanan ini otomatis muncul saat membuat proyek atau penugasan dalam unit {brand.id}.
              </p>
            </div>

            {policy.canManageBrand() && (
              <div className="chips">
                <button
                  className="btn small ghost"
                  onClick={() => setBulkEditServices(brand.services.join("\n"))}
                >
                  <Pencil size={13} /> Edit Massal
                </button>
              </div>
            )}
          </div>

          {/* Quick Add Bar */}
          {policy.canManageBrand() && (
            <div style={{ background: "var(--canvas)", padding: 14, borderRadius: "var(--r-md)", margin: "14px 0", border: "1px solid var(--border)" }}>
              <b style={{ fontSize: ".84rem", display: "block", marginBottom: 8 }}>Tambah Layanan Cepat</b>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleAddService(newServiceInput);
                }}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <input
                  type="text"
                  className="input"
                  placeholder="Ketik nama layanan baru (misal: Social Media Management)..."
                  value={newServiceInput}
                  onChange={e => setNewServiceInput(e.target.value)}
                  style={{ flex: "1 1 280px" }}
                />
                <button
                  type="submit"
                  className="btn small primary"
                  disabled={saveBrand.isPending || !newServiceInput.trim()}
                >
                  <Plus size={14} /> Tambah Layanan
                </button>
              </form>

              {/* Recommended Presets */}
              <div style={{ marginTop: 12 }}>
                <span className="muted" style={{ fontSize: ".76rem", display: "block", marginBottom: 6 }}>
                  Saran Layanan Populer (klik untuk menambahkan langsung):
                </span>
                <div className="chips">
                  {SERVICE_PRESETS.filter(p => !brand.services.includes(p)).slice(0, 6).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className="chip"
                      onClick={() => handleAddService(preset)}
                      title="Klik untuk langsung menambahkan ke brand"
                      style={{ borderStyle: "dashed" }}
                    >
                      <Plus size={12} style={{ marginRight: 2 }} /> {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Service Cards Grid */}
          {brand.services.length > 0 ? (
            <div className="brand-svc-grid" style={{ marginTop: 14 }}>
              {brand.services.map(svcName => {
                // Calculate projects using this service
                const usedInProjects = mine.filter(p =>
                  p.name.toLowerCase().includes(svcName.toLowerCase()) ||
                  (p.description && p.description.toLowerCase().includes(svcName.toLowerCase()))
                ).length;

                return (
                  <div key={svcName} className="brand-svc-chip-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--ink)", flexShrink: 0 }}>
                        <Layers size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <b className="clamp1" style={{ fontSize: ".9rem" }}>{svcName}</b>
                        <small className="muted" style={{ display: "block", marginTop: 2 }}>
                          {usedInProjects > 0 ? `${usedInProjects} proyek terkait` : "Tersedia untuk proyek"}
                        </small>
                      </div>
                    </div>

                    {policy.canManageBrand() && (
                      <ConfirmButton
                        className="tool"
                        label={<X size={15} className="muted" />}
                        armed={<Trash2 size={15} style={{ color: "var(--bad)" }} />}
                        onConfirm={() => handleRemoveService(svcName)}
                        ariaLabel={`Hapus layanan ${svcName}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty art="tasks" title="Belum ada jenis layanan">
              {policy.canManageBrand()
                ? "Tambahkan jenis layanan di atas agar tim dapat memilih layanan standar saat penugasan."
                : "Superadmin atau Manajer Brand belum menambahkan jenis layanan."}
            </Empty>
          )}

          {/* Bulk Edit Modal */}
          {bulkEditServices !== null && (
            <div className="dialog-wrap">
              <div className="scrim" onClick={() => setBulkEditServices(null)} />
              <div className="dialog" role="dialog" aria-modal="true" style={{ width: "min(520px, 94vw)" }}>
                <div className="dialog-h">
                  <div>
                    <h2>Edit Massal Layanan Brand</h2>
                    <p className="muted">Tulis satu layanan per baris. Perubahan akan langsung disimpan ke katalog.</p>
                  </div>
                  <button className="tool" onClick={() => setBulkEditServices(null)}><X size={16} /></button>
                </div>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const lines = bulkEditServices
                      .split("\n")
                      .map(s => s.trim())
                      .filter(Boolean);
                    saveBrand.mutate(
                      { id: brand.id, services: lines },
                      { onSuccess: () => setBulkEditServices(null) }
                    );
                  }}
                >
                  <div className="dialog-b">
                    <label className="field">
                      <span>Daftar Layanan</span>
                      <textarea
                        className="input"
                        rows={10}
                        value={bulkEditServices}
                        onChange={e => setBulkEditServices(e.target.value)}
                        placeholder="Web Development&#10;Social Media Management&#10;Branding & Design"
                        autoFocus
                      />
                    </label>
                  </div>
                  <div className="dialog-f">
                    <button type="button" className="btn ghost" onClick={() => setBulkEditServices(null)}>
                      Batal
                    </button>
                    <button type="submit" className="btn primary" disabled={saveBrand.isPending}>
                      Simpan Layanan
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ======================================================== TAB 4: TIM & OPERASIONAL */}
      {subTab === "team" && (
        <section className="bc">
          <div className="bc-h">
            <div>
              <h2>Personalia & Tim Operasional {brand.id} ({brandMembers.length})</h2>
              <p className="muted" style={{ fontSize: ".82rem", margin: "2px 0 0" }}>
                Anggota tim yang ditugaskan ke divisi entitas {brand.id} atau memegang peran Project Manager.
              </p>
            </div>
          </div>

          {brandMembers.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 14, marginTop: 14 }}>
              {brandMembers.map(m => {
                const managedProjects = mine.filter(p => p.pmEmail === m.email).length;
                return (
                  <div key={m.email} className="brand-card-item" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <Avatar m={m} big />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b style={{ fontSize: ".96rem", display: "block" }}>{m.name}</b>
                        <small className="muted clamp1" style={{ display: "block" }}>{m.role || m.email}</small>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                          {m.level && <span className="tag proj" style={{ fontSize: ".68rem" }}>{m.level}</span>}
                          {m.group && <span className="tag due" style={{ fontSize: ".68rem" }}>{m.group}</span>}
                          {m.isAdmin && <span className="tag ok" style={{ fontSize: ".68rem" }}>Admin</span>}
                        </div>
                      </div>
                    </div>

                    {m.jobdesk && (
                      <p className="muted clamp2" style={{ fontSize: ".78rem", margin: "6px 0 0", lineHeight: 1.4 }} title={m.jobdesk}>
                        {m.jobdesk}
                      </p>
                    )}

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".78rem" }}>
                      <span className="muted">
                        {managedProjects > 0 ? `${managedProjects} proyek dikelola` : "Anggota unit"}
                      </span>
                      <button
                        className="btn small ghost"
                        style={{ height: 26, fontSize: ".74rem" }}
                        onClick={() => go("/inbox")}
                      >
                        <MessageSquare size={13} style={{ marginRight: 4 }} /> Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty art="people" title="Belum ada anggota tim terdaftar di divisi ini">
              Superadmin dapat mengatur unit divisi anggota di menu Superadmin → Tim.
            </Empty>
          )}
        </section>
      )}

      {/* ======================================================== EDIT BRAND MODAL */}
      {editingBrand && (
        <BrandEditModal
          brand={brand}
          onClose={() => setEditingBrand(false)}
          onSave={patch => {
            saveBrand.mutate(patch, {
              onSuccess: () => setEditingBrand(false),
            });
          }}
          isSaving={saveBrand.isPending}
        />
      )}

      {/* ======================================================== CREATE PROJECT MODAL */}
      {creatingProject && (
        <ProjectSetup
          defaultEntityId={brand.id}
          onClose={() => setCreatingProject(false)}
        />
      )}
    </Page>
  );
}

/** Modal to edit brand details (name, description, theme color, services) */
function BrandEditModal({
  brand,
  onClose,
  onSave,
  isSaving,
}: {
  brand: EntityDTO;
  onClose: () => void;
  onSave: (patch: { id: string; name?: string; description?: string; color?: Color; services?: string[] }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(brand.name);
  const [description, setDescription] = useState(brand.description);
  const [color, setColor] = useState<Color>(brand.color);
  const [servicesText, setServicesText] = useState(brand.services.join("\n"));

  return (
    <div className="dialog-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" style={{ width: "min(560px, 94vw)" }}>
        <div className="dialog-h">
          <div>
            <h2>Ubah Profil Brand {brand.id}</h2>
            <p className="muted">Perbarui informasi entitas, warna tema, dan katalog layanan.</p>
          </div>
          <button className="tool" onClick={onClose}><X size={16} /></button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            const svcs = servicesText
              .split("\n")
              .map(s => s.trim())
              .filter(Boolean);
            onSave({
              id: brand.id,
              name: name.trim(),
              description: description.trim(),
              color,
              services: svcs,
            });
          }}
        >
          <div className="dialog-b">
            <label className="field">
              <span>Nama Brand / Entitas</span>
              <input
                className="input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Deskripsi Singkat</span>
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Deskripsi kegiatan atau unit bisnis..."
              />
            </label>

            <div className="field">
              <span>Tema Warna Brand</span>
              <ColorPicker value={color} onChange={c => setColor(c as Color)} />
            </div>

            <label className="field">
              <span>Jenis Layanan (satu per baris)</span>
              <textarea
                className="input"
                rows={5}
                value={servicesText}
                onChange={e => setServicesText(e.target.value)}
                placeholder="Social Media&#10;Web Development&#10;Branding"
              />
            </label>
          </div>

          <div className="dialog-f">
            <button type="button" className="btn ghost" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={isSaving || !name.trim()}>
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

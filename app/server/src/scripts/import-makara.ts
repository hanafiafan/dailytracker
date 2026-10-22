// One-off: import the Makara task tracker CSV as tasks of the "Makara" project for Hanafi (web developer) and Veronica (PM).
//   DATA_DIR=./data npx tsx src/scripts/import-makara.ts <tracker.csv>   (optional env: HANAFI_EMAIL, VERONICA_EMAIL)
// Safe to re-run: a row whose "[MKR-xxx]" title prefix already exists in the project is skipped.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { wib } from "@shared/time";
import { openDb } from "../db/index.js";
import { activity, labels, members, projectServices, projects, taskLabels, tasks } from "../db/schema.js";
import { newId } from "../context.js";

const csvPath = process.argv[2];
if (!csvPath) { console.error("usage: import-makara <tracker.csv>"); process.exit(1); }

/** Minimal RFC-4180 parser: quoted fields, "" escapes, newlines inside quotes. */
function parseCsv(s: string) {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const [head, ...body] = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, "")).filter(r => r.some(Boolean));
const recs = body.map(r => Object.fromEntries(head!.map((h, i) => [h, (r[i] ?? "").trim()])));

const db = openDb(join(process.env.DATA_DIR ?? "./data", "app.db"));
const find = (envEmail: string | undefined, ...names: string[]) => {
  const m = envEmail ? db.select().from(members).where(eq(members.email, envEmail)).get()
    : db.select().from(members).where(sql.raw(names.map(n => `lower(name) like '%${n}%'`).join(" or "))).get();
  if (!m) { console.error(`Anggota tidak ditemukan (${envEmail ?? names.join("/")}). Set HANAFI_EMAIL / VERONICA_EMAIL.`); process.exit(1); }
  return m;
};
const hanafi = find(process.env.HANAFI_EMAIL, "hanafi", "afan"), veronica = find(process.env.VERONICA_EMAIL, "vero");
const pic = (s: string) => s.startsWith("Veronica") ? veronica : hanafi;

const now = Date.now(), today = wib().date;
let project: typeof projects.$inferSelect | undefined = db.select().from(projects).where(eq(projects.name, "Makara")).get();
if (!project) { project = { id: newId(), name: "Makara", color: "mint", description: "Perbaikan dan migrasi situs makaratrust.id", archived: false, createdAt: now, closedAt: null, closedBy: null, summary: "", resultLinks: [], clientEmail: null, pmEmail: veronica.email, startDate: null, dueDate: null }; db.insert(projects).values(project).run(); }
const labelId = new Map<string, string>();
const label = (name: string) => {
  if (!labelId.has(name)) labelId.set(name, db.select().from(labels).where(eq(labels.name, name)).get()?.id ?? (() => { const id = newId(); db.insert(labels).values({ id, name, color: "sky" }).run(); return id; })());
  return labelId.get(name)!;
};

// One service per phase ("F1 Darurat: ..."), so the project page shows progress per phase.
const serviceId = new Map<string, string>();
for (const fase of [...new Set(recs.map(r => r.Fase!))]) {
  const found = db.select().from(projectServices).where(and(eq(projectServices.projectId, project.id), eq(projectServices.name, fase))).get();
  const id = found?.id ?? newId();
  if (!found) db.insert(projectServices).values({ id, projectId: project.id, name: fase, description: "", status: "doing", createdAt: now, targetQty: 0, unit: "", dueDate: null, picEmails: [hanafi.email, veronica.email] }).run();
  serviceId.set(fase, id);
}

const PRIORITY = { Kritis: "urgent", Tinggi: "high", Sedang: "normal", Rendah: "low" } as const;
const toStatus = (s: string): "todo" | "doing" | "done" => s === "Selesai" ? "done" : s === "Sedang proses" ? "doing" : "todo";
let added = 0, skipped = 0;
db.transaction(tx => {
  for (const r of recs) {
    const prefix = `[${r.ID}]`;
    const have = tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, project!.id), like(tasks.title, `${prefix}%`))).get();
    if (have) { tx.update(tasks).set({ serviceId: serviceId.get(r.Fase!)! }).where(and(eq(tasks.id, have.id), isNull(tasks.serviceId))).run(); skipped++; continue; }
    const owner = pic(r.PIC!), status = toStatus(r.Status!), priority = PRIORITY[r.Prioritas as keyof typeof PRIORITY] ?? "normal";
    const date = r["Tanggal selesai / target (usulan)"] || r["Tanggal mulai"] || today;
    const at = Date.parse(`${date}T12:00:00+07:00`);
    const note = [
      r.Deskripsi, r.Status === "Terblokir" || r.Status === "Ditunda" ? `Status: ${r.Status}` : "",
      r["Dukungan (peran pendukung)"] && `Dukungan: ${r["Dukungan (peran pendukung)"]}`,
      r["Bergantung pada"] && `Bergantung pada: ${r["Bergantung pada"]}`,
      r["Hasil / bukti"] && `Hasil: ${r["Hasil / bukti"]}`, r.Catatan && `Catatan: ${r.Catatan}`, `${r.Fase} · ${r.Kategori}`,
    ].filter(Boolean).join("\n");
    const id = newId(), by = pic("Veronica");
    tx.insert(tasks).values({
      id, email: owner.email, date, title: `${prefix} ${r.Tugas}`, note, start: null, due: null, status, hot: priority === "high" || priority === "urgent", priority,
      projectId: project!.id, serviceId: serviceId.get(r.Fase!)!, needProof: false, by: "owner", fromAdmin: by.name, createdAt: now,
      startedAt: status === "todo" ? null : at, doneAt: status === "done" ? at : null,
    }).run();
    for (const l of [r.Fase!, ...(r.Status === "Terblokir" || r.Status === "Ditunda" ? [r.Status] : [])]) tx.insert(taskLabels).values({ taskId: id, labelId: label(l) }).run();
    tx.insert(activity).values({ id: newId(), taskId: id, actorEmail: by.email, actorName: by.name, kind: "created", text: `memberi tugas kepada ${owner.name}`, at: now }).run();
    added++;
  }
});
console.log(`Proyek Makara: ${added} tugas ditambahkan, ${skipped} dilewati (sudah ada). Hanafi=${hanafi.email}, Veronica=${veronica.email}`);

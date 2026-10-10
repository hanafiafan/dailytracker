// Clears tasks, projects and related working data before launch, keeping the team. Dry run unless --apply.
//   node dist/scripts/reset-launch.js /data/app.db [--apply] [--chat] [--leaves] [--acks]
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../db/index.js";
import { applyReset, planReset } from "../reset.js";

const [path, ...flags] = process.argv.slice(2);
if (!path || !existsSync(path)) { console.error("usage: reset-launch <app.db> [--apply] [--chat] [--leaves] [--acks]"); process.exit(1); }
const o = { chat: flags.includes("--chat"), leaves: flags.includes("--leaves"), acks: flags.includes("--acks") };
const db = openDb(path);
const plan = planReset(db, o);

console.log("AKAN DIHAPUS:");
for (const r of plan.remove) console.log(`  ${String(r.n).padStart(6)}  ${r.label}`);
console.log("\nTETAP ADA:");
for (const r of plan.keep) console.log(`  ${String(r.n).padStart(6)}  ${r.label}`);
if (plan.placeholderEmails.length) console.log(`\nPERHATIAN: ${plan.placeholderEmails.length} anggota masih beremail sementara (tidak bisa login): ${plan.placeholderEmails.join(", ")}`);
if (!plan.admins) console.log("\nPERHATIAN: belum ada anggota yang ditandai admin.");

if (!flags.includes("--apply")) { console.log("\nDry run: belum ada yang diubah. Tambahkan --apply untuk menjalankan."); process.exit(0); }
const dir = join(dirname(path), "backups");
mkdirSync(dir, { recursive: true });
const backup = join(dir, `pre-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
await db.sqlite.backup(backup);
console.log(`\nCadangan sebelum hapus: ${backup}`);
applyReset(db, o);
console.log("Selesai. Data kerja dihapus, anggota tetap ada.");

// Imports the "dailytask-migrasi" package (from the claude.ai version) into the SQLite database.
//   DATA_DIR=/data node scripts/import-migrasi.js /path/to/dailytask-migrasi [--apply] [--reset]
// Emails come from email-map.json; people without one get <id>@belum-diisi.local (fix later in Kelola tim > Ubah,
// the tasks move along). --reset empties the database first. Stop the server before --apply.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openStore } from "../src/store.js";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply"), RESET = process.argv.includes("--reset");
if (!dir) { console.error("usage: import-migrasi.js <folder> [--apply] [--reset]"); process.exit(1); }
const data = JSON.parse(readFileSync(join(dir, "dailytask-export.json")));
const emails = JSON.parse(readFileSync(join(dir, "email-map.json")));
const clean = e => String(e || "").trim().toLowerCase();
const valid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const writes = [], placeholders = [], used = new Set();
for (const m of data.team) {
  let email = clean(emails[m.id]);
  if (!valid(email)) { email = `${m.id}@belum-diisi.local`; placeholders.push(m.name); }
  if (used.has(email)) throw new Error(`email dipakai dua kali: ${email}`);
  used.add(email);
  writes.push([`team/${email}`, {
    name: m.name, role: m.role || "", order: m.order ?? 999,
    ...(m.group ? { group: m.group } : {}),
    ...(m.isAdmin ? { isAdmin: true, adminGroups: m.adminGroups || [] } : {}),
    ...(m.photo ? { photo: m.photo } : {}),
  }]);
  const p = data.people[m.id];
  if (!p) continue;
  if ((p.routines || []).length || p.askAt) writes.push([`tasks/${email}`, { routines: p.routines || [], askAt: p.askAt || null }]);
  for (const t of p.tasks || []) {
    const { id, ...task } = t;
    if (task.proof) {
      const { asset, photoFile, ...proof } = task.proof;
      if (photoFile && existsSync(join(dir, photoFile))) {
        writes.push([`proofs/${email}/items/${id}`, { data: "data:image/jpeg;base64," + readFileSync(join(dir, photoFile)).toString("base64"), at: proof.at || Date.now() }]);
        proof.photo = true;
      }
      task.proof = proof;
    }
    writes.push([`tasks/${email}/items/${id}`, task]);
  }
}
const count = re => writes.filter(([p]) => re.test(p)).length;
console.log(`Anggota tim: ${count(/^team\//)} | Tugas: ${count(/^tasks\/[^/]+\/items\//)} | Foto bukti: ${count(/^proofs\//)} | Orang dg tugas rutin: ${count(/^tasks\/[^/]+$/)}`);
if (placeholders.length) console.log(`Email belum diisi (pakai email sementara): ${placeholders.join(", ")}`);
if (!APPLY) { console.log("Belum menulis apa pun. Tambahkan --apply."); process.exit(0); }

const store = openStore(process.env.DATA_DIR || "./data");
store.db.exec("BEGIN");
if (RESET) store.db.exec("DELETE FROM docs");
for (const [path, doc] of writes) store.set(path, doc);
store.db.exec("COMMIT");
console.log("Selesai.");

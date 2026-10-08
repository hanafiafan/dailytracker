// Imports the JSON from "Ekspor semua data" (claude.ai version) into the SQLite database.
//   DATA_DIR=/data node scripts/import-export.js tugas-harian-export.json
// Stop the server first. People without a known email get <name>@belum-diisi.local; change it later in
// Kelola tim > Ubah (the tasks move with the email). Safe to re-run: same paths are overwritten.
import { readFileSync } from "node:fs";
import { openStore } from "../src/store.js";

const x = JSON.parse(readFileSync(process.argv[2], "utf8"));
const store = openStore(process.env.DATA_DIR || "./data");
const emailOf = new Map();                                    // old team key -> new email
for (const c of x.claims || []) if (c.email) emailOf.set(c.uid, c.email.toLowerCase());
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "anggota";
const used = new Set();
const unique = e => { let n = e, i = 2; while (used.has(n)) n = e.replace("@", `-${i++}@`); used.add(n); return n; };

let people = 0, tasks = 0, proofs = 0;
for (const m of x.team) {
  const email = unique(emailOf.get(m.key) || emailOf.get(m.uid) || `${slug(m.name)}@belum-diisi.local`);
  emailOf.set(m.key, email);
  const { id, key, uid, ...rest } = m;
  store.set(`team/${email}`, rest); people++;

  const kd = x.routines[m.key] || {};
  if (Object.keys(kd).length) store.set(`tasks/${email}`, kd);
  for (const t of x.tasks[m.key] || []) {
    const { id: tid, proof, ...data } = t;
    const p = proof ? { at: proof.at, ...(proof.link ? { link: proof.link } : {}), ...(x.proofs[`${m.key}/${tid}`] ? { photo: true } : {}) } : null;
    store.set(`tasks/${email}/items/${tid}`, { ...data, ...(p ? { proof: p } : {}) }); tasks++;
    const img = x.proofs[`${m.key}/${tid}`];
    if (img) { store.set(`proofs/${email}/items/${tid}`, { data: img, at: (proof && proof.at) || Date.now() }); proofs++; }
  }
}
console.log(`Diimpor: ${people} orang, ${tasks} tugas, ${proofs} foto bukti.`);
const missing = x.team.filter(m => emailOf.get(m.key).endsWith("@belum-diisi.local")).map(m => m.name);
if (missing.length) console.log("Email belum diketahui (isi lewat Kelola tim):", missing.join(", "));

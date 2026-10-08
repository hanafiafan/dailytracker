// Import dailytask-export.json ke Firebase (Firestore) untuk versi aplikasi HP (folder pwa/ di repo).
//
// Pakai:
//   1. npm install
//   2. Isi email-map.json (email Google tiap orang).
//   3. Unduh kunci service account: Firebase Console > Project settings > Service accounts > Generate new private key
//      simpan sebagai service-account.json di folder ini (JANGAN dibagikan / di-upload ke GitHub).
//   4. Coba dulu tanpa menulis:   node import-firebase.mjs
//      Kalau ringkasannya benar:  node import-firebase.mjs --apply
import { readFileSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const KEY = process.argv.find(a => a.endsWith(".json") && a.includes("service")) || "./service-account.json";
const data = JSON.parse(readFileSync(new URL("./dailytask-export.json", import.meta.url)));
const emails = JSON.parse(readFileSync(new URL("./email-map.json", import.meta.url)));
const clean = e => String(e || "").trim().toLowerCase();
const valid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const writes = [];   // [path, data]
const skipped = [], used = new Set();
for (const m of data.team) {
  const email = clean(emails[m.id]);
  if (!email) { skipped.push(`${m.name} (email belum diisi)`); continue; }
  if (!valid(email)) { skipped.push(`${m.name} (email tidak valid: ${email})`); continue; }
  if (used.has(email)) { skipped.push(`${m.name} (email ${email} dipakai dua kali)`); continue; }
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
    const { id, ...rest } = t;
    const task = { ...rest };
    if (task.proof) {
      const { asset, photoFile, ...proof } = task.proof;
      if (photoFile && existsSync(new URL("./" + photoFile, import.meta.url))) {
        const b64 = readFileSync(new URL("./" + photoFile, import.meta.url)).toString("base64");
        writes.push([`proofs/${email}/items/${id}`, { data: "data:image/jpeg;base64," + b64, at: proof.at || Date.now() }]);
        proof.photo = true;
      }
      task.proof = proof;
    }
    writes.push([`tasks/${email}/items/${id}`, task]);
  }
}

const count = pfx => writes.filter(([p]) => p.startsWith(pfx)).length;
console.log(`Anggota tim  : ${count("team/")}`);
console.log(`Tugas        : ${writes.filter(([p]) => /^tasks\/[^/]+\/items\//.test(p)).length}`);
console.log(`Foto bukti   : ${count("proofs/")}`);
console.log(`Tugas rutin  : ${writes.filter(([p]) => /^tasks\/[^/]+$/.test(p)).length} orang`);
if (skipped.length) console.log(`Dilewati     : ${skipped.join(", ")}`);
const ownerEmail = clean(emails._owner);
if (ownerEmail) console.log(`Pemilik      : ${ownerEmail} (pastikan sama dengan OWNER_EMAIL di config.js dan firestore.rules)`);

if (!APPLY) { console.log("\nBelum ada yang ditulis. Jalankan lagi dengan --apply untuk mengimpor."); process.exit(0); }
if (!existsSync(KEY)) { console.error(`\nFile kunci ${KEY} tidak ditemukan.`); process.exit(1); }

const admin = (await import("firebase-admin")).default;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(KEY))) });
const db = admin.firestore();
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  for (const [path, doc] of writes.slice(i, i + 400)) batch.set(db.doc(path), doc, { merge: true });
  await batch.commit();
  console.log(`Tertulis ${Math.min(i + 400, writes.length)}/${writes.length}`);
}
console.log("Selesai. Buka aplikasinya dan login dengan akun pemilik untuk mengecek.");

// One-off copy of the Firebase data (team, tasks, routines, proof photos) into the SQLite database.
//   npm i --no-save firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json DATA_DIR=/var/lib/tugas-harian node scripts/migrate-firestore.js
// Safe to re-run: documents with the same path are overwritten. Stop the server first.
import { openStore } from "../src/store.js";

const { default: admin } = await import("firebase-admin");
admin.initializeApp();
const fs = admin.firestore();
const store = openStore(process.env.DATA_DIR || "./data");
let n = 0;
const put = (path, data) => { store.set(path, data); n++; };

for (const d of (await fs.collection("team").get()).docs) put(d.ref.path, d.data());
for (const ref of await fs.collection("tasks").listDocuments()) {     // includes people who only have sub-items
  const d = await ref.get();
  if (d.exists) put(ref.path, d.data());
}
for (const d of (await fs.collectionGroup("items").get()).docs) {     // tasks/<email>/items/* and proofs/<email>/items/*
  if (/^(tasks|proofs)\/[^/]+\/items\/[^/]+$/.test(d.ref.path)) put(d.ref.path, d.data());
}
console.log(`Migrated ${n} documents.`);

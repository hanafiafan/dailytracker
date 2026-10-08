# Daily Task — Catatan Serah Terima untuk Developer

Aplikasi tugas harian untuk tim (±22 orang, unit HCS / HCM / HUC). Repo ini berisi
dua implementasi yang sudah berjalan + snapshot database lengkap, sebagai dasar
pembuatan **versi mandiri**.

## Isi repo

| Path | Keterangan |
|---|---|
| `claude-ai/index.html` | Implementasi utama yang dipakai sekarang (artifact claude.ai, satu file HTML/JS tanpa build). Referensi fitur paling lengkap. |
| `pwa/` | Versi mandiri awal: PWA + Firebase (Auth Google + Firestore + Hosting). Proyek: `dailytask-a8327`. |
| `database/dailytask-export.json` | Snapshot database 8 Okt 2026 (format `dailytask-export/1`). |
| `database/dailytask.sql` | Snapshot yang sama dalam SQL (PostgreSQL/MySQL/SQLite). |
| `database/proof-photos/` | Foto bukti tugas (dirujuk `proof.photoFile`). |
| `database/import-firebase.mjs` | Importer ke skema Firestore versi `pwa/`. |
| `docs/` | Panduan karyawan & setup (PDF). |

## Peran & akses

- **Pemilik** (`hellensdev@gmail.com` di versi PWA; tampil atas nama "Aziz"): kendali penuh, menyetujui akun, mengelola tim.
- **Admin semua unit** (`isAdmin: true`, `adminGroups: []`) — Aziz, Vero: lihat & beri tugas ke semua orang termasuk admin lain.
- **Admin unit** (`adminGroups: ["HCS"]`, dst.) — mis. Fahru (HCS), Yoga (HCM), Cece (HUC): hanya orang di unitnya, tidak bisa mengatur admin lain.
- **Karyawan**: hanya melihat & mengerjakan tugasnya sendiri.

## Model data (`dailytask-export.json`)

```
team[]      id, name, role, group(unit), isAdmin, adminGroups[], order, photo(dataURL|null), claudeUid, email(null → isi)
people{memberId}
  askAt       ms | null      — waktu terakhir minta tugas
  routines[]  id, title, note, start, due, days[0-6], hot, needProof, byName
  tasks[]     id, title, note, date(YYYY-MM-DD), start/due(HH:MM), status(todo|doing|done),
              hot, needProof, by(owner|self), fromAdmin, source, routine,
              createdAt, startedAt, doneAt, returnedAt  (Unix ms)
              proof{at, link?, photoFile?}, report, reportAt, editedBy, editedAt,
              comments[]{id, by, text, at, auto?}, autoRemindAt
adminLinks[]  id, title, url, at   — link khusus admin (omzet, tracker)
tagLog[]      riwayat "tag admin"
```

## Fitur yang harus dipertahankan

1. Login per orang + persetujuan pemilik; tiap karyawan hanya melihat tugasnya.
2. Tugas harian & rutin (hari tertentu), jam mulai/selesai 24 jam, prioritas "Penting".
3. Status todo → doing → done dengan jam aktual; bukti wajib (foto/link); admin bisa "Kembalikan".
4. Admin/pemilik memberi tugas ke satu/banyak orang (pilih semua, per unit, admin & lead); edit tugas yang sudah dikirim; label "Dari X"/"Diubah X".
5. Tugas buatan sendiri dengan sumber ("dari siapa").
6. Komentar di semua tugas + pengingat otomatis 15 menit setelah lewat jam selesai.
7. Peringatan orang tanpa tugas + tombol "Minta tugas ke admin" + notifikasi ke admin.
8. Tag admin (mis. "@Fahru, Nayla belum dikasih tugas"), status menunggu/ditangani.
9. Rekap matriks per orang 7/14 hari; catatan harian; link admin; kelola tim (drag & drop, foto, unit, admin).

## Catatan teknis versi claude.ai

Karena izin claude.ai terbatas, versi itu memakai enkripsi (ECDH/ECDSA) untuk salinan admin
(`mirror/`) dan perintah admin (`cmd/`). **Di server sendiri ini tidak perlu** — cukup
aturan akses berbasis peran di backend (lihat `pwa/firestore.rules` sebagai contoh).

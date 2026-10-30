# Daily Task — Tugas Harian Tim

Aplikasi tugas harian karyawan (HAN Creative / Mamoa).

## Aplikasi yang aktif

Versi yang dipakai sekarang ada di **`app/`** (Hono + SQLite di server, React di web). Lihat `app/README.md` untuk cara menjalankan dan `app/deploy/` untuk pemasangan.

- Peran khusus (Brand Owner, Director, Project Manager) ditentukan oleh kolom **Level** pada anggota, yang hanya bisa diubah Superadmin. Nama, email, dan jabatan tidak memberi hak akses apa pun.
- Migrasi database ada di `app/server/drizzle/` dan dijalankan otomatis saat server mulai. Setelah mengubah `schema.ts`, jalankan `npx drizzle-kit generate` di `app/server`.

## Arsip (versi lama, tidak dipakai lagi)

| Folder | Isi |
|---|---|
| `claude-ai/index.html` | Versi lama: artifact **Daily Task** di claude.ai (satu file HTML). |
| `pwa/` | Versi aplikasi HP (PWA + Firebase): `public/` (kode), `firestore.rules`, `firebase.json`, `BACA-DULU.txt`. |
| `docs/` | Panduan karyawan & panduan setup (PDF). |
| `database/` | Snapshot database lengkap (JSON, SQL, foto bukti) + skrip impor Firebase. |
| `DEVELOPER.md` | Catatan serah terima untuk developer: peran, model data, daftar fitur. |

## Catatan

- Snapshot database per 10 Okt 2026 ada di `database/`; data live tetap di claude.ai.
- Versi claude.ai butuh kemampuan artifact `db`, `user` (profile) dan `assets`; hanya berjalan sebagai artifact claude.ai.
- Versi PWA: proyek Firebase `dailytask-a8327` sudah terpasang; ikuti `pwa/BACA-DULU.txt`.

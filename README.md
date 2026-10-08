# Daily Task — Tugas Harian Tim

Aplikasi tugas harian karyawan (HAN Creative / Mamoa).

## Isi repo

| Folder | Isi |
|---|---|
| `claude-ai/index.html` | Versi yang dipakai sekarang: artifact **Daily Task** di claude.ai (satu file HTML). |
| `pwa/` | Versi aplikasi HP (PWA + Firebase): `public/` (kode), `firestore.rules`, `firebase.json`, `BACA-DULU.txt`. |
| `docs/` | Panduan karyawan & panduan setup (PDF). |
| `database/` | Snapshot database lengkap (JSON, SQL, foto bukti) + skrip impor Firebase. |
| `DEVELOPER.md` | Catatan serah terima untuk developer: peran, model data, daftar fitur. |

## Catatan

- Snapshot database per 8 Okt 2026 ada di `database/`; data live tetap di claude.ai.
- Versi claude.ai butuh kemampuan artifact `db`, `user` (profile) dan `assets`; hanya berjalan sebagai artifact claude.ai.
- Versi PWA: proyek Firebase `dailytask-a8327` sudah terpasang; ikuti `pwa/BACA-DULU.txt`.

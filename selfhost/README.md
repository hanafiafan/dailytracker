# Tugas Harian - versi VPS sendiri

Pengganti versi Firebase (`../pwa`): satu server Node.js + SQLite, login Google, notifikasi Web Push, tanpa layanan berbayar.

- `server/` API, update realtime (SSE), push, pengingat terjadwal, aturan akses (`src/rules.js`).
- `public/` aplikasi PWA (sama dengan versi Firebase; hanya `fb.js` yang diganti).
- `deploy/` systemd, Caddy, dan panduan pasang: baca `deploy/README.md`.

Uji lokal: `cd server && npm i && npm test`.

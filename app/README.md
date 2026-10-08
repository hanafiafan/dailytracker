# Tugas Harian (React + Hono)

Aplikasi tugas harian tim kreatif: login Google, tugas + bukti foto/link, rekap, komentar, tugas rutin, notifikasi Web Push.

| Bagian | Teknologi |
|---|---|
| `web/` | React 19, Vite, TypeScript, Tailwind v4, TanStack Query, dnd-kit, PWA (vite-plugin-pwa) |
| `server/` | Hono (REST + SSE), Drizzle ORM, SQLite (better-sqlite3), Zod, web-push |
| `shared/` | Skema Zod, aturan akses (`policy.ts`), helper tanggal. Dipakai server dan web |

Klien web memakai `hono/client`, jadi path, body, dan respons API dicek tipenya dari kode server.

## Jalankan lokal
```sh
npm ci
cp server/.env.example server/.env   # isi GOOGLE_CLIENT_ID dan OWNER_EMAIL
npm run dev:server                    # http://127.0.0.1:3000
npm run dev:web                       # http://localhost:5173 (proxy /api ke server)
npm run typecheck && npm test         # tipe + tes server (aturan akses, API, pengingat)
```
Skema DB ada di `server/src/db/schema.ts`; setelah mengubahnya jalankan `npm run db:generate -w server` dan commit folder `server/drizzle`. Migrasi dijalankan otomatis saat server mulai.

## Deploy
Push ke `main` menjalankan `.github/workflows/app.yml`: typecheck, tes, build, lalu image dikirim ke VPS lewat SSH dan dijalankan dengan `deploy/docker-compose.yml`.
Secret repo yang dibutuhkan: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Pindah dari versi lama
`node dist/scripts/migrate-legacy.js <tugas.db lama> <app.db baru> [dailytask-export.json]`

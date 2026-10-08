# Memasang Tugas Harian di VPS sendiri

Ubuntu/Debian, domain sudah mengarah (record A) ke IP VPS. Semua perintah sebagai root/sudo.

## 1. Google Sign-In (sekali)
Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID** → *Web application*.
- Authorized JavaScript origins: `https://tugas.contoh.com`
- (Redirect URI tidak perlu.)
Salin **Client ID**-nya. Jika diminta, isi OAuth consent screen (External, nama aplikasi, email).

## 2. Paket
```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs caddy sqlite3
useradd -r -s /usr/sbin/nologin tugas
mkdir -p /opt/tugas-harian /var/lib/tugas-harian && chown tugas /var/lib/tugas-harian
```

## 3. Kode
Salin folder `selfhost/` dari repo ke `/opt/tugas-harian/` (git clone atau rsync), lalu:
```sh
cd /opt/tugas-harian/server && npm ci --omit=dev
cp ../deploy/tugas-harian.env.example /etc/tugas-harian.env && chmod 600 /etc/tugas-harian.env
nano /etc/tugas-harian.env            # isi GOOGLE_CLIENT_ID, PUBLIC_URL
cp ../deploy/tugas-harian.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now tugas-harian
```

## 4. HTTPS
```sh
cp /opt/tugas-harian/deploy/Caddyfile /etc/caddy/Caddyfile && nano /etc/caddy/Caddyfile   # ganti domain
systemctl reload caddy
```
Buka `https://domainmu` dan masuk dengan akun pemilik.

## 5. Pindahkan data lama (opsional)
Firebase Console → Project settings → Service accounts → Generate new private key (simpan file JSON di VPS, jangan di repo).
```sh
systemctl stop tugas-harian
cd /opt/tugas-harian/server && npm i --no-save firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=/root/sa.json DATA_DIR=/var/lib/tugas-harian node scripts/migrate-firestore.js
chown -R tugas /var/lib/tugas-harian && systemctl start tugas-harian && shred -u /root/sa.json
```

## 6. Backup harian
```sh
echo '0 2 * * * root sqlite3 /var/lib/tugas-harian/tugas.db ".backup /var/backups/tugas-$(date +\%a).db"' > /etc/cron.d/tugas-harian
```
Simpan salinan `/var/backups/tugas-*.db` ke tempat lain secara berkala.

## Operasi
- Log: `journalctl -u tugas-harian -f`
- Update: ganti kode, `npm ci --omit=dev`, `systemctl restart tugas-harian`
- Notifikasi di iPhone: aplikasi harus dipasang ke layar utama (Share → Add to Home Screen).

## Jika VPS sudah memakai Coolify / Traefik
Port 80/443 sudah dipakai, jadi jangan pasang Caddy. Pakai Docker: lihat `deploy/docker-compose.yml`
(buat `/etc/tugas-harian.env` dari contoh, `mkdir -p /var/lib/tugas-harian && chown 1000:1000 /var/lib/tugas-harian`, lalu `docker compose ... up -d --build`).

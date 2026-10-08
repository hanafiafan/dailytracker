// ============================================================
//  PENGATURAN — isi bagian ini sebelum aplikasi dipasang.
// ============================================================

// 1) Tempel konfigurasi dari Firebase Console:
//    Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config
export const firebaseConfig = {
  apiKey: "AIzaSyDuSOicBkI4IWtgBGQuLcr9GkmksRawtvs",
  authDomain: "dailytask-a8327.firebaseapp.com",
  projectId: "dailytask-a8327",
  storageBucket: "dailytask-a8327.firebasestorage.app",
  messagingSenderId: "747680179966",
  appId: "1:747680179966:web:d62c34f557459efa1127af",
  measurementId: "G-LSEM91HZQ3",
};

// Kunci push (VAPID): Firebase Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair.
// Tempel "Key pair" di sini. Kosong = notifikasi push belum aktif.
export const VAPID_KEY = "";

// Alamat Worker Cloudflare yang mengirim push (muncul setelah "wrangler deploy", mis. https://tugas-harian-push.NAMA.workers.dev).
export const WORKER_URL = "";

// 2) Email Google pemilik aplikasi (yang bisa melihat dan mengatur semua).
//    Harus sama dengan email di file firestore.rules.
export const OWNER_EMAIL = "hellensdev@gmail.com";

// 3) Daftar tim awal. Email tiap orang diisi lewat aplikasi saat pertama kali dibuka.
export const DEFAULT_TEAM = [
  { name: "Vero", role: "Admin", isAdmin: true },
  { name: "Aziz", role: "Admin", isAdmin: true },
  { name: "Fahru", role: "Leader Creative" },
  { name: "Rizky", role: "Fotografer & Videografer" },
  { name: "Abied", role: "Editor" },
  { name: "Nabiel", role: "Editor & AI" },
  { name: "Hasan", role: "Sosmed" },
  { name: "Cece", role: "Creator" },
  { name: "Asep", role: "Operasional" },
  { name: "Rifqi", role: "Ads" },
  { name: "Nayla", role: "Affiliator" },
  { name: "Dian", role: "Affiliator" },
  { name: "Niswa", role: "Sales 1" },
  { name: "Albi", role: "Sales 2" },
];

// ============================================================
//  PENGATURAN — isi bagian ini sebelum aplikasi dipasang.
// ============================================================

// 1) Tempel konfigurasi dari Firebase Console:
//    Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config
export const firebaseConfig = {
  apiKey: "GANTI",
  authDomain: "GANTI.firebaseapp.com",
  projectId: "GANTI",
  storageBucket: "GANTI.appspot.com",
  messagingSenderId: "GANTI",
  appId: "GANTI",
};

// 2) Email Google pemilik aplikasi (yang bisa melihat dan mengatur semua).
//    Harus sama dengan email di file firestore.rules.
export const OWNER_EMAIL = "rtekidvector@gmail.com";

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

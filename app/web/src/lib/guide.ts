import type { GuideRole } from "@shared/policy";

export type Icon = "sun" | "check" | "clock" | "chat" | "leave" | "spark" | "assign" | "watch" | "approve" | "team" | "crown" | "terms";
export interface GuideSection { id: string; icon: Icon; h: string; items: string[]; tip?: string }
export interface RoleGuide { label: string; intro: string; highlights: string[]; sections: GuideSection[] }

const clock: GuideSection = { id: "waktu", icon: "clock", h: "Waktu dan pengingat", items: [
  "Pakai timer di tugas untuk mencatat waktu kerja. Timer yang sedang jalan tampil di bagian atas layar.",
  "Kamu mendapat pengingat sebelum tenggat (standarnya 30 menit, bisa diatur pemberi tugas).",
  "Kalau tugas belum selesai 15 menit setelah jam selesai, komentar Pengingat otomatis muncul di tugas itu dan masuk ke lonceng. Selesaikan, atau jelaskan kendalanya lewat komentar.",
] };
const talk: GuideSection = { id: "komunikasi", icon: "chat", h: "Berkomunikasi", items: [
  "Tulis komentar di dalam tugas untuk bertanya atau memberi kabar. Ketik @nama untuk menyebut orang.",
  "Inbox berisi kanal Umum, kanal proyek, dan grup. Siapa pun bisa membuat grup lewat tombol Grup baru, memilih anggotanya, dan mengaturnya lewat ikon roda gigi. Grup bersifat pribadi: hanya anggota yang bisa membaca.",
  "Lonceng menampilkan tugas baru, komentar, pengingat, dan tag untukmu.",
] };
const leave: GuideSection = { id: "izin", icon: "leave", h: "Izin dan alat", items: [
  "Ajukan cuti, izin, atau sakit di halaman Izin. Atasan yang memutuskan; statusnya terlihat di sana.",
  "Booking kamera, studio, atau lokasi di halaman Alat. Pilih jam kosong di jadwal; bisa dikaitkan ke tugas.",
] };
const tips: GuideSection = { id: "tips", icon: "spark", h: "Tips", items: [
  "Pasang aplikasi ke layar utama dan aktifkan notifikasi (Pengaturan, bagian Notifikasi).",
  "Cari apa saja dengan Ctrl+K atau /. Tekan n untuk tugas baru. Tekan g lalu d, p, l, k, y, i, a, atau m untuk pindah halaman.",
] };

const terms = (extra: string[] = []): GuideSection => ({ id: "ketentuan", icon: "terms", h: "Syarat dan ketentuan", items: [
  "Gunakan hanya akun Google yang didaftarkan atas namamu. Jangan berbagi akun atau memakai akun orang lain.",
  "Tugas, bukti, chat, dan data tim adalah data perusahaan. Jangan membagikannya ke luar tim tanpa izin.",
  "Catat status dan jam kerja dengan jujur. Bukti yang dilampirkan harus asli dan sesuai tugasnya.",
  "Pasang aplikasi, aktifkan notifikasi, dan tanggapi pengingat serta komentar tepat waktu.",
  "Aktivitasmu (status, komentar, perubahan) tercatat dan dapat dilihat atasan sesuai peran mereka.",
  ...extra,
  "Pelanggaran terhadap ketentuan ini ditindaklanjuti sesuai kebijakan perusahaan.",
] });

const employee: GuideSection[] = [
  { id: "mulai", icon: "sun", h: "Mulai hari", items: [
    "Buka Dasbor: tugasmu hari ini dan yang belum selesai dari hari sebelumnya ada di sana. Ganti hari dengan panah di atas.",
    "Ketuk status tugas untuk mengubahnya: Belum, Dikerjakan, lalu Selesai. Jam mulai dan selesai tercatat otomatis.",
    "Saat pertama membuka aplikasi di sebuah perangkat, ada langkah wajib: pasang aplikasi (di HP), izinkan notifikasi, dan kirim notifikasi uji.",
  ] },
  { id: "selesai", icon: "check", h: "Menyelesaikan tugas", items: [
    "Tugas bertanda Wajib bukti hanya bisa selesai setelah kamu melampirkan foto atau link hasil kerja. Catatan singkat boleh ditambahkan.",
    "Kalau tugas dikembalikan atasan, baca komentarnya, perbaiki, lalu tandai selesai lagi.",
    "Semua tugas selesai? Di Dasbor ketuk Minta tugas ke admin; admin langsung mendapat pemberitahuan. Kamu juga bisa menambah tugas sendiri lewat tombol + dan menulis dari siapa tugas itu.",
  ] },
  clock, talk, leave, tips, terms(),
];

const unitOnly: GuideSection[] = [
  { id: "mulai", icon: "sun", h: "Mulai hari", items: [
    "Dasbor menampilkan progres unitmu dan orang yang belum punya tugas aktif. Orang yang menekan Minta tugas ditandai ikon tangan dan kamu mendapat pemberitahuan.",
    "Tugas yang diberikan kepadamu ada di Dasbor, tab Tugas saya (atau lewat kartu pintasan di Ringkasan). Kerjakan dan beri bukti seperti anggota lain.",
  ] },
  { id: "beri", icon: "assign", h: "Memberi tugas", items: [
    "Kamu memantau anggota biasa di unit yang diberikan Superadmin. Orang di luar unitmu dan sesama admin tidak terlihat.",
    "Beri tugas lewat tombol Tambah tugas: pilih orang, tanggal, jam, prioritas, dan Wajib bukti. Pilih Ulangi rutin untuk tugas harian atau mingguan.",
    "Kalau memberi jam selesai, pilih juga kapan penerima diingatkan (15 menit sampai 1 hari sebelumnya). Tugas dengan tenggat yang sudah mepet langsung ditandai.",
    "Ubah, hapus, atau kembalikan tugas yang sudah selesai kalau buktinya belum sesuai.",
  ] },
  { id: "pantau", icon: "watch", h: "Memantau", items: [
    "Beri komentar pada tugas, atau kirim pengingat dari tugas yang terlambat (maksimal satu kali per jam per tugas).",
    "Tugas anggota unitmu yang belum selesai 15 menit setelah jam selesai otomatis diberi komentar pengingat dan kamu mendapat pemberitahuan di lonceng.",
    "Laporan merangkum kinerja per orang dan per hari; salin atau cetak untuk dibagikan.",
  ] },
  { id: "setuju", icon: "approve", h: "Persetujuan dan tim", items: [
    "Izin dan cuti anggota unitmu menunggu keputusanmu di halaman Izin. Angka di menu menandakan ada yang menunggu.",
    "Di halaman Tim kamu bisa memperbaiki nama dan jabatan anggota biasa di unitmu. Menambah, menghapus, atau mengubah unit anggota hanya bisa dilakukan Superadmin.",
  ] },
  clock, talk, leave, tips,
];

/** The unit guide, reworded for people who are not limited to one unit. */
const wide = (owner: boolean) => unitOnly.map(s => s.id === "beri" ? { ...s, items: ["Kamu memantau seluruh anggota tim tanpa batas unit.", ...s.items.slice(1)] }
  : s.id === "setuju" ? { ...s, items: [s.items[0]!, owner ? "Di halaman Tim kamu mengelola seluruh anggota (lihat bagian Khusus Superadmin)." : "Di halaman Tim kamu bisa memperbaiki nama dan jabatan anggota. Menambah, menghapus, atau mengubah unit anggota hanya bisa dilakukan Superadmin."] } : s);

const adminExtra: GuideSection[] = [
  { id: "semua-unit", icon: "team", h: "Cakupan semua unit", items: [
    "Kamu boleh memberi tugas ke admin lain; mereka melihatnya di tab Tugas saya.",
    "Filter unit di Dasbor membatasi tampilan ke satu unit. Laporan harian dan rekap tersedia untuk seluruh tim.",
    "Kelola Proyek dan label supaya tugas terkelompok dan laporannya rapi. Tutup proyek untuk melihat laporan akhirnya.",
    "Atur daftar alat, studio, dan lokasi di halaman Alat; nonaktifkan yang tidak dipakai. Setujui atau tolak izin dan cuti seluruh tim.",
    "Permintaan tugas dan pengingat terlambat otomatis dari semua unit sampai kepadamu.",
  ] },
];

const ownerExtra: GuideSection[] = [
  { id: "superadmin", icon: "crown", h: "Khusus Superadmin", items: [
    "Akunmu adalah Superadmin (pemilik aplikasi): semua tugas, laporan, dan data tim terlihat olehmu tanpa batas unit.",
    "Hanya Superadmin yang menambah anggota, menghapus atau memindah email, mengatur urutan dan unit, menunjuk atau mencabut admin, dan menentukan unit yang dipantau tiap admin (halaman Tim). Admin lain tidak bisa melakukan ini.",
    "Isi Atasan langsung tiap orang (Tim, Ubah) agar bagan organisasi sesuai kenyataan. Tanpa itu, anggota melapor ke kepala unitnya atau ke Superadmin.",
    "Orang baru perlu didaftarkan emailnya di halaman Tim sebelum bisa masuk. Email yang belum terdaftar melihat pesan \"Email belum terdaftar\".",
    "Menghapus anggota atau alat bersifat permanen. Berkas ekspor database berisi data pribadi karyawan; simpan dengan hati-hati.",
  ] },
];

export const GUIDE: Record<GuideRole, RoleGuide> = {
  karyawan: { label: "Karyawan", intro: "Cara memakai aplikasi untuk tugas harianmu, dari membuka hari sampai menyelesaikan tugas dengan bukti.", highlights: ["Ubah status tugas: Belum, Dikerjakan, Selesai", "Tugas Wajib bukti perlu foto atau link", "Pasang aplikasi dan aktifkan notifikasi"], sections: employee },
  unit: { label: "Admin unit", intro: "Memantau dan memberi tugas untuk unit yang kamu kelola, serta mengerjakan tugasmu sendiri.", highlights: ["Beri tugas dengan jam dan peringatan tenggat", "Putuskan izin dan cuti unitmu", "Pantau yang terlambat dan minta tugas"], sections: [...unitOnly, terms(["Gunakan kewenangan admin secara wajar dan adil, dan jaga kerahasiaan data anggota unitmu."])] },
  admin: { label: "Admin semua unit", intro: "Mengelola seluruh tim tanpa batas unit.", highlights: ["Pantau semua unit dan proyek", "Beri tugas ke siapa pun, termasuk admin", "Kelola alat, izin, dan laporan"], sections: [...wide(false), ...adminExtra, terms(["Gunakan kewenangan admin secara wajar dan adil, dan jaga kerahasiaan data seluruh tim."])] },
  owner: { label: "Superadmin", intro: "Kendali penuh atas tim, akses, dan data.", highlights: ["Hanya kamu yang mengelola anggota dan admin", "Isi atasan langsung agar bagan sesuai", "Jaga akses dan data pribadi karyawan"], sections: [{ id: "mulai", icon: "sun", h: "Mulai hari", items: ["Dasbor menampilkan progres seluruh tim dan orang yang belum punya tugas aktif. Orang yang menekan Minta tugas ditandai ikon tangan dan kamu mendapat pemberitahuan."] }, ...wide(true).filter(s => s.id !== "mulai"), ...adminExtra, ...ownerExtra, terms(["Sebagai Superadmin, kamu bertanggung jawab atas pemberian akses dan keamanan data seluruh tim."])] },
};

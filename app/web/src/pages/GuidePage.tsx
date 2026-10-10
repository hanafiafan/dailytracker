import { useState } from "react";
import { Page } from "../components/Page";
import { useViewer } from "../lib/viewer";

type Role = "karyawan" | "unit" | "admin" | "owner";
type Sec = { h: string; items: string[] };

const KARYAWAN: Sec[] = [
  { h: "Mulai hari", items: [
    "Buka Dasbor: tugasmu hari ini dan yang belum selesai dari hari sebelumnya ada di sana. Ganti hari dengan panah di atas.",
    "Ketuk status tugas untuk mengubahnya: Belum, Dikerjakan, lalu Selesai. Jam mulai dan selesai tercatat otomatis.",
    "Pakai timer di tugas untuk mencatat waktu kerja. Timer yang sedang jalan tampil di bagian atas layar.",
  ] },
  { h: "Menyelesaikan tugas", items: [
    "Tugas bertanda Wajib bukti hanya bisa selesai setelah kamu melampirkan foto atau link hasil kerja. Catatan singkat boleh ditambahkan.",
    "Kalau tugas dikembalikan atasan, baca komentarnya, perbaiki, lalu tandai selesai lagi.",
    "Tidak ada tugas? Tambah tugas sendiri lewat tombol + dan tulis dari siapa tugas itu. Admin melihat kalau kamu belum punya tugas aktif.",
  ] },
  { h: "Berkomunikasi", items: [
    "Tulis komentar di dalam tugas untuk bertanya atau memberi kabar. Kamu juga mendapat pengingat saat tenggat mendekati.",
    "Inbox untuk percakapan tim. Lonceng menampilkan tugas baru, komentar, dan tag untukmu.",
  ] },
  { h: "Izin dan alat", items: [
    "Ajukan cuti atau izin di halaman Izin. Admin yang menyetujui; statusnya terlihat di sana.",
    "Booking kamera, studio, atau lokasi di halaman Alat. Pilih jam kosong di jadwal, bisa dikaitkan ke tugas.",
  ] },
  { h: "Tips", items: [
    "Pasang aplikasi ke layar utama dan aktifkan notifikasi lewat Pengaturan.",
    "Cari apa saja dengan Ctrl+K atau /. Tekan n untuk tugas baru. Tekan g lalu d, p, l, k, y, i, a, atau m untuk pindah halaman.",
  ] },
];

const UNIT: Sec[] = [
  { h: "Yang bisa kamu lakukan", items: [
    "Kamu memantau anggota biasa di unit yang diberikan pemilik. Orang di luar unitmu dan sesama admin tidak terlihat.",
    "Beri tugas lewat tombol Tambah tugas: pilih orang, tanggal, jam, prioritas, dan Wajib bukti. Pilih Ulangi rutin untuk tugas harian atau mingguan.",
    "Ubah, hapus, atau kembalikan tugas yang sudah selesai kalau buktinya belum sesuai.",
  ] },
  { h: "Memantau", items: [
    "Dasbor menampilkan progres tim dan orang yang belum punya tugas aktif.",
    "Halaman Tim berisi anggota unitmu; kamu bisa menambah dan mengubah profil anggota biasa di unitmu.",
    "Laporan merangkum kinerja per orang dan per hari; salin atau cetak untuk dibagikan.",
  ] },
  { h: "Persetujuan dan komunikasi", items: [
    "Izin dan cuti anggota unitmu menunggu persetujuanmu di halaman Izin. Angka merah di menu menandakan ada yang menunggu.",
    "Beri komentar pada tugas, atau kirim pengingat dari tugas yang terlambat (maksimal satu kali per jam per tugas).",
  ] },
  { h: "Tugasmu sendiri", items: ["Kamu tetap punya tugas pribadi. Kerjakan dan beri bukti seperti karyawan lain (lihat tab Karyawan)."] },
];

const ADMIN: Sec[] = [
  { h: "Yang bisa kamu lakukan", items: [
    "Admin semua unit memantau seluruh anggota tim, dan boleh memberi tugas ke admin lain.",
    "Tambah anggota baru, ubah profil dan unit, dan jadikan seseorang admin atau cabut aksesnya di halaman Tim.",
    "Semua yang bisa dilakukan admin unit (lihat tab Admin unit) berlaku untuk semua unit.",
  ] },
  { h: "Memantau", items: [
    "Filter unit di Dasbor membatasi tampilan ke satu unit.",
    "Laporan harian dan rekap tersedia untuk seluruh tim.",
    "Kelola Proyek dan label supaya tugas terkelompok dan laporannya rapi. Tutup proyek untuk melihat laporan akhirnya.",
  ] },
  { h: "Alat dan izin", items: [
    "Atur daftar alat, studio, dan lokasi di halaman Alat; nonaktifkan yang tidak dipakai.",
    "Setujui atau tolak izin dan cuti seluruh tim.",
  ] },
];

const OWNER: Sec[] = [
  { h: "Yang hanya bisa dilakukan pemilik", items: [
    "Akunmu adalah pemilik aplikasi: semua tugas, laporan, dan data tim terlihat olehmu tanpa batas unit.",
    "Menunjuk atau mencabut admin, dan menentukan unit mana yang dipantau tiap admin (halaman Tim, lalu pilih orangnya).",
    "Menghapus anggota atau alat bersifat permanen. Hapus hanya jika yakin.",
  ] },
  { h: "Mengatur tim", items: [
    "Orang baru perlu didaftarkan emailnya di halaman Tim sebelum bisa masuk. Email yang belum terdaftar akan melihat pesan \"Email belum terdaftar\".",
    "Admin unit hanya melihat unitnya. Beri akses semua unit hanya pada orang yang kamu percaya penuh.",
  ] },
  { h: "Data dan cadangan", items: [
    "Berkas ekspor database berisi data pribadi karyawan; simpan dan bagikan dengan hati-hati.",
  ] },
];

const TITLE: Record<Role, string> = { karyawan: "Karyawan", unit: "Admin unit", admin: "Admin semua unit", owner: "Pemilik" };
const BODY: Record<Role, Sec[]> = { karyawan: KARYAWAN, unit: UNIT, admin: ADMIN, owner: OWNER };
const INTRO: Record<Role, string> = {
  karyawan: "Cara memakai aplikasi untuk tugas harianmu.",
  unit: "Memantau dan memberi tugas untuk unit yang kamu kelola.",
  admin: "Mengelola seluruh tim tanpa batas unit. Berlaku juga semua panduan Admin unit.",
  owner: "Kendali penuh atas tim dan data. Berlaku juga semua panduan Admin semua unit.",
};

export function GuidePage() {
  const { policy } = useViewer();
  const mine: Role = policy.isOwner ? "owner" : policy.isBoss ? "admin" : policy.isAdmin ? "unit" : "karyawan";
  const [tab, setTab] = useState<Role>(mine);
  return (
    <Page title="Panduan" sub={`Akunmu: ${TITLE[mine]}`} noNew tabs={(Object.keys(TITLE) as Role[]).map(id => ({ id, label: TITLE[id] }))} tab={tab} onTab={id => setTab(id as Role)}>
      <p className="muted" style={{ marginBottom: 12 }}>{INTRO[tab]}{tab !== mine && " (Kamu melihat panduan peran lain.)"}</p>
      {BODY[tab].map(s => (
        <section key={s.h} className="bc">
          <div className="bc-h"><h2>{s.h}</h2></div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>{s.items.map(i => <li key={i}>{i}</li>)}</ul>
        </section>
      ))}
    </Page>
  );
}

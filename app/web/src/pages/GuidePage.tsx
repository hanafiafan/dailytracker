import { useState } from "react";
import { Page } from "../components/Page";
import { useViewer } from "../lib/viewer";

type Role = "karyawan" | "unit" | "admin" | "owner";
type Sec = { h: string; items: string[] };

const KARYAWAN: Sec[] = [
  { h: "Mulai hari", items: [
    "Buka Dasbor: tugasmu hari ini dan yang belum selesai dari hari sebelumnya ada di sana. Ganti hari dengan panah di atas.",
    "Ketuk status tugas untuk mengubahnya: Belum, Dikerjakan, lalu Selesai. Jam mulai dan selesai tercatat otomatis.",
    "Saat pertama membuka aplikasi di sebuah perangkat, ada langkah wajib: izinkan notifikasi dan kirim notifikasi uji. Aplikasi baru bisa dipakai setelah itu selesai.",
    "Pakai timer di tugas untuk mencatat waktu kerja. Timer yang sedang jalan tampil di bagian atas layar.",
  ] },
  { h: "Menyelesaikan tugas", items: [
    "Tugas bertanda Wajib bukti hanya bisa selesai setelah kamu melampirkan foto atau link hasil kerja. Catatan singkat boleh ditambahkan.",
    "Kalau tugas dikembalikan atasan, baca komentarnya, perbaiki, lalu tandai selesai lagi.",
    "Semua tugas selesai? Di Dasbor ketuk Minta tugas ke admin; admin langsung mendapat pemberitahuan dan tombolnya berubah jadi jam permintaanmu. Kamu juga bisa menambah tugas sendiri lewat tombol + dan menulis dari siapa tugas itu.",
  ] },
  { h: "Berkomunikasi", items: [
    "Tulis komentar di dalam tugas untuk bertanya atau memberi kabar. Kamu mendapat pengingat 30 menit sebelum tenggat. Kalau tugas masih belum selesai 15 menit setelah jam selesai, komentar Pengingat otomatis muncul di tugas itu dan masuk ke lonceng. Selesaikan, atau jelaskan kendalanya lewat komentar.",
    "Inbox untuk percakapan tim: kanal Umum, kanal proyek, dan grup. Siapa pun bisa membuat grup lewat tombol Grup baru, memilih anggotanya, dan mengatur atau menghapusnya lewat ikon roda gigi. Grup bersifat pribadi: hanya anggota yang bisa membaca. Lonceng menampilkan tugas baru, komentar, dan tag untukmu.",
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
    "Kamu memantau anggota biasa di unit yang diberikan Superadmin. Menambah, menghapus, atau mengubah unit anggota hanya bisa dilakukan Superadmin; kamu bisa memperbaiki nama dan jabatan orang di unitmu. Orang di luar unitmu dan sesama admin tidak terlihat.",
    "Beri tugas lewat tombol Tambah tugas: pilih orang, tanggal, jam, prioritas, dan Wajib bukti. Kalau memberi jam selesai, pilih juga kapan penerima diingatkan (15 menit sampai 1 hari sebelumnya); tugas dengan tenggat yang sudah mepet langsung ditandai. Pilih Ulangi rutin untuk tugas harian atau mingguan.",
    "Ubah, hapus, atau kembalikan tugas yang sudah selesai kalau buktinya belum sesuai.",
  ] },
  { h: "Memantau", items: [
    "Dasbor menampilkan progres tim dan orang yang belum punya tugas aktif. Orang yang menekan Minta tugas ditandai ikon tangan, dan kamu mendapat pemberitahuan; beri tugas lewat tombol + di namanya.",
    "Halaman Tim berisi anggota unitmu; kamu bisa memperbaiki nama dan jabatan anggota biasa di unitmu. Menambah atau menghapus anggota hanya Superadmin.",
    "Laporan merangkum kinerja per orang dan per hari; salin atau cetak untuk dibagikan.",
  ] },
  { h: "Persetujuan dan komunikasi", items: [
    "Izin dan cuti anggota unitmu menunggu persetujuanmu di halaman Izin. Angka merah di menu menandakan ada yang menunggu.",
    "Beri komentar pada tugas, atau kirim pengingat dari tugas yang terlambat (maksimal satu kali per jam per tugas).",
    "Tugas anggota unitmu yang masih belum selesai 15 menit setelah jam selesai otomatis diberi komentar pengingat, dan kamu mendapat pemberitahuan di lonceng. Kamu tidak perlu menagih satu per satu.",
  ] },
  { h: "Tugasmu sendiri", items: ["Tugas yang diberikan kepadamu ada di Dasbor, tab Tugas saya. Kerjakan dan beri bukti seperti karyawan lain (lihat tab Karyawan)."] },
];

const ADMIN: Sec[] = [
  { h: "Yang bisa kamu lakukan", items: [
    "Admin semua unit memantau seluruh anggota tim, dan boleh memberi tugas ke admin lain.",
    "Kamu boleh memberi tugas ke admin lain; mereka melihatnya di tab Tugas saya.",
    "Semua yang bisa dilakukan admin unit (lihat tab Admin unit) berlaku untuk semua unit.",
  ] },
  { h: "Memantau", items: [
    "Filter unit di Dasbor membatasi tampilan ke satu unit.",
    "Laporan harian dan rekap tersedia untuk seluruh tim.",
    "Permintaan tugas dan pengingat terlambat otomatis (15 menit setelah jam selesai) dari semua unit sampai kepadamu.",
    "Kelola Proyek dan label supaya tugas terkelompok dan laporannya rapi. Tutup proyek untuk melihat laporan akhirnya.",
  ] },
  { h: "Alat dan izin", items: [
    "Atur daftar alat, studio, dan lokasi di halaman Alat; nonaktifkan yang tidak dipakai.",
    "Setujui atau tolak izin dan cuti seluruh tim.",
  ] },
];

const OWNER: Sec[] = [
  { h: "Yang hanya bisa dilakukan Superadmin", items: [
    "Akunmu adalah Superadmin (pemilik aplikasi): semua tugas, laporan, dan data tim terlihat olehmu tanpa batas unit. Semua permintaan tugas dan pengingat terlambat otomatis juga sampai kepadamu.",
    "Mengisi Atasan langsung tiap orang (Tim, Ubah) agar bagan organisasi sesuai kenyataan. Tanpa itu, anggota otomatis melapor ke kepala unitnya atau ke Superadmin.",
    "Menambah anggota baru, menghapus atau memindahkan email, mengatur urutan dan unit, menunjuk atau mencabut admin, dan menentukan unit mana yang dipantau tiap admin (halaman Tim). Admin lain tidak bisa melakukan ini.",
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

const TITLE: Record<Role, string> = { karyawan: "Karyawan", unit: "Admin unit", admin: "Admin semua unit", owner: "Superadmin" };
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

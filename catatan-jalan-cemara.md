# Catatan Rekaman "Jalan Cemara" (durasi 76:49)

> Dibuat otomatis dari transkrip Whisper (model `small`, mode Indonesia). Rekaman campur Indonesia–Jawa, suara pelan, banyak orang bicara bersamaan, jadi **akurasi rendah**. Isi di bawah adalah rangkuman tema yang cukup konsisten muncul; detail angka/nama ditandai **(?)** bila tidak pasti. Transkrip mentah ber-timestamp: `transkrip-jalan-cemara.txt`.
>
> Dua file `Jalan Cemara.m4a` dan `Jalan Cemara 2.m4a` identik (hasil decode sama persis).

## Gambaran umum
Diskusi 2+ orang (satu tampak sebagai pemilik/operasional jualan online, satu lagi pembuat/penyusun sistem) tentang **sistem custom untuk stok, penjualan, dan omzet** toko online di marketplace (**Shopee** dan **TikTok Shop**, juga disebut Tokopedia/"Tok Pet" (?)). Dibahas alur gudang, packing, retur, COD, dan dashboard.

Menit ~47:00 s/d 52:00 dan 68:00 s/d 76:49 hampir tidak ada percakapan (musik/derau/senyap); teks di sana hasil halusinasi Whisper dan bisa diabaikan.

## Poin utama per bagian
**0:00–6:00 – Alur produk & stok**
- Membahas alur barang: bahan mentah → produksi → stok jadi → packing → kirim. Ada perbedaan stok fisik vs stok sistem; selisih bikin pemilik kesulitan.
- Permintaan produk (contoh disebut ukuran 5 liter dan stiker; angka seperti 100/200 (?)).
- Sistem sering "tidak valid"/error karena pencatatan tidak sinkron; perlu sistem supaya flow tetap jalan dan terpantau (disebut kamera CCTV untuk cek fisik).

**7:00–19:00 – Stok, packing, retur**
- Pesanan masuk bisa langsung dipacking jika stok barang jadi ada; jika tidak, ambil dari bahan siap packing.
- Dibahas jenis stok: **stok awal, penambahan, jual, retur, reject, sisa** ("stock penambahan, stock jualan, stock returan, stock rejeksing").
- Retur dan pembatalan memengaruhi stok dan omzet; biaya packing/tambahan (stiker, tutup, botol) dihitung per pesanan (nominal ~500 rupiah (?)).
- Peran: orang operasional paham lapangan, pembuat sistem perlu penjelasan flow supaya bisa dimodelkan.

**20:00–33:00 – Pembayaran, COD, pencatatan penjualan**
- Fitur **COD** dan pembayaran belum selesai dites; perlu cek deskripsi, foto, dan lain-lain sebelum rilis.
- Alur COD: barang dikirim kurir, uang kembali setelah diterima; status bisa berubah (retur/batal).
- Penjualan/omzet dihitung dari data marketplace. Ada ide **sinkron berkala** (misal tiap jam, ~jam 10, 12, 17) lewat spreadsheet/real time, dan bisa memakai webhook.
- Pembuat sistem menyebut sistem custom bisa mendukung format Tokopedia/TikTok via spreadsheet.

**33:00–47:00 – Input manual vs otomatis**
- Biaya (ongkir, platform) saat ini diinput manual; pembatalan dan retur juga manual. Masalah: tidak real time, mudah selisih.
- Usulan: otomatisasi dari platform (penjualan, retur, biaya) sehingga dashboard tahu total pesanan, total omzet, per jam.
- Retur mengurangi omzet dan menambah beban biaya.
- Tiktok profile/medium dan analisis produk disinggung sekilas.

**52:00–66:00 – Dashboard, per platform, definisi omzet**
- Sempat menentukan mulai dari **Shopee dan TikTok** dulu, lalu **konsolidasi** total dari dua platform.
- Dashboard: pantauan **real time**, update tiap jam tertentu; validasi pesanan terakhir (misal jam 5 sore) bisa baru final 2–12 jam kemudian karena kemungkinan retur/batal.
- **Omzet dihitung dari pesanan yang selesai** (bukan hanya masuk); retur otomatis mengurangi omzet dan beban biaya per pesanan.
- Biaya platform dan **layanan logistik** (misal potongan ongkir/layanan, contoh harga 80.000 turun ~10.000 (?)) dihitung ulang setelah pesanan selesai; persentase bisa beda per platform/individu.
- Perlu mekanisme: pesanan masuk → pesanan valid → selesai; retur dikurangkan.

## Tindak lanjut yang tersirat (belum tentu disebut eksplisit)
- [ ] Selesaikan dan tes fitur COD/payment.
- [ ] Otomatiskan penarikan data pesanan/retur/biaya dari Shopee & TikTok Shop (hapus input manual).
- [ ] Definisikan status pesanan valid/selesai dan aturan perhitungan omzet.
- [ ] Dashboard real time per platform + konsolidasi.
- [ ] Hitung biaya per pesanan (packing, stiker, ongkir, platform, retur).

## Saran
Untuk catatan yang akurat (nama, angka, keputusan), transkripsi ulang dengan model Whisper `medium`/`large` (perlu unduh model, ± 1.5–3 GB) atau layanan transkripsi yang mendukung bahasa Jawa, dan kalau bisa pakai audio yang lebih bersih.

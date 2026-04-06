# Sistem Manajemen Pengiriman Produk Elektronik

Aplikasi web internal untuk mendukung proses distribusi mesin cuci merek Panasonic: pencatatan nomor seri terdigitalisasi, pemindaian barcode di lapangan, dan pemantauan agregat oleh manajemen di kantor. Dokumen ini disusun sebagai **outliner** materi skripsi dan sekaligus panduan teknis proyek.

---

## 1. Deskripsi Proyek

### 1.1 Latar belakang masalah yang diselesaikan

Perusahaan bergerak dalam distribusi produk elektronik khususnya mesin cuci Panasonic. Secara historis, **pencatatan nomor seri dilakukan secara manual** (misalnya lembar kerja Excel) di lingkungan gudang atau di samping kendaraan pengiriman. Dalam praktik operasional, **satu unit mobil pengangkut dapat memuat sekitar 150 unit** mesin cuci dengan **berbagai tipe**, sementara **volume harian dapat mencapai 20 mobil atau lebih**, sehingga **estimasi beban entri mencapai ribuan pemindaian atau pencatatan per hari** (orde **±3000**). Pola kerja tersebut rentan terhadap **kesalahan manusia** (salah ketik, duplikasi, kelalaian), **keterlambatan visibilitas data** di kantor pusat, serta **sulitnya audit** ketika data tersebar di berkas lokal.

### 1.2 Tujuan sistem

1. **Mengotomatisasi** pencatatan nomor seri melalui pemindaian barcode pada stiker kemasan.  
2. **Memvalidasi format** nomor seri sesuai aturan bisnis (10 karakter: tahun 2 digit, bulan 1 karakter, 7 digit urutan).  
3. **Menyentralikan data** pada basis data terstruktur dengan autentikasi dan pemisahan hak akses.  
4. **Menyediakan dasbor dan rekap** agar manajer dapat memantau aktivitas pengiriman secara **kontinyu** (termasuk pembaruan **realtime** pada dasbor utama).

### 1.3 Manfaat sistem

| Aspek | Manfaat |
|--------|---------|
| Operasional | Mengurangi waktu entri manual dan beban kognitif staf di lapangan. |
| Kualitas data | Validasi format dan pengecekan duplikasi pada sisi aplikasi menekan human error. |
| Manajemen | Agregasi harian/mingguan/bulanan, visualisasi grafik, serta ekspor PDF/Excel untuk pelaporan. |
| Keamanan | Akses berbasis peran (staf vs. manajer) melalui middleware Next.js dan kebijakan Supabase. |

---

## 2. Arsitektur Sistem

### 2.1 Gambaran umum

Sistem dirancang sebagai **aplikasi web** berbasis **Next.js 14 (App Router)**. Lapisan klien menangani antarmuka, pemindaian kamera, dan **inferensi YOLOv8** di peramban melalui **ONNX Runtime Web**. Lapisan backend bersifat **Backend-as-a-Service** dengan **Supabase** (PostgreSQL, autentikasi, Realtime). Komponen AI tidak berjalan di server produksi untuk inferensi barcode; model **ONNX** diunduh oleh klien dan dieksekusi di **WASM**, lalu wilayah yang terdeteksi diteruskan ke **html5-qrcode** (decoder berbasis ZXing) untuk membaca isi barcode.

### 2.2 Diagram arsitektur (ASCII)

```
                    ┌─────────────────────────────────────────┐
                    │              Pengguna                    │
                    │   Staf (gudang/truk)  │  Manajer (kantor) │
                    └───────────┬─────────────┬────────────────┘
                                │             │
                                ▼             ▼
                    ┌───────────────────────────────────────────┐
                    │     Next.js 14 — App Router (Vercel)      │
                    │  ┌─────────────┐    ┌──────────────────┐   │
                    │  │ /input      │    │ /dashboard/*     │   │
                    │  │ YOLO+ONNX   │    │ Realtime + Rekap │   │
                    │  │ html5-qrcode│    │ Recharts, PDF/XLS│   │
                    │  └──────┬──────┘    └────────┬─────────┘   │
                    └─────────┼─────────────────────┼────────────┘
                              │  HTTPS (REST/RT)    │
                              ▼                     ▼
                    ┌───────────────────────────────────────────┐
                    │              Supabase                        │
                    │  • Auth (sesi, JWT)                        │
                    │  • PostgreSQL (pengiriman, detail, NS)      │
                    │  • Realtime (channel dashboard)             │
                    │  • RPC: submit_pengiriman_staff           │
                    └───────────────────────────────────────────┘
```

### 2.3 Tech stack dan justifikasi

| Teknologi | Peran | Justifikasi |
|-----------|--------|-------------|
| **Next.js 14 (App Router)** | Framework full-stack React, routing, middleware | SSR/CSR fleksibel, proteksi rute server-side, ekosistem matang untuk produksi. |
| **Supabase (PostgreSQL + Auth + Realtime)** | Basis data, autentikasi, langganan perubahan data | Mengurangi beban operasi DB sendiri; RLS dapat dikonfigurasi di proyek; Realtime mendukung dasbor “hidup”. |
| **YOLOv8 + ONNX Runtime Web** | Deteksi region barcode pada frame video | Model ringan di klien; tidak membebani GPU server; cocok untuk skenario lapangan dengan kamera perangkat. |
| **html5-qrcode + ZXing** | Dekode barcode (Code 128, EAN, UPC, QR) | Perpustakaan stabil untuk berbagai format; dipakai pada hasil crop dari detektor YOLO. |
| **Tailwind CSS + shadcn/ui (Radix)** | Styling dan komponen UI | Pengembangan UI konsisten, aksesibilitas dasar melalui primitif Radix. |
| **Vercel** | Hosting dan CI/CD untuk Next.js | Integrasi native dengan Next.js; HTTPS dan penyebaran global. |

---

## 3. Fitur Sistem

### 3.1 Role-based access control (Staf & Manajer)

- Autentikasi melalui **Supabase Auth**.  
- Tabel **`profiles`** menyimpan **`role`**: `staff` atau `manager`.  
- **Middleware** Next.js (`src/middleware.ts`): rute `/input` hanya untuk **staf**; rute `/dashboard` dan anaknya hanya untuk **manajer**. Pengguna tanpa profil atau peran tidak valid diarahkan ke halaman login atau root.

### 3.2 Modul input pengiriman

- Form multi-baris: **toko tujuan**, **nomor kendaraan**, **catatan**, serta **beberapa tipe mesin** dengan daftar nomor seri per tipe.  
- Penyimpanan melalui **RPC** `submit_pengiriman_staff` agar header, detail, dan nomor seri tersimpan dalam **satu transaksi**.

### 3.3 Sistem scan barcode dengan YOLOv8

- Modul pemindaian (mis. `YoloScanner`) memanfaatkan **model ONNX** (`public/models/barcode-detector.onnx`), **praproses** frame kamera, **inferensi** di peramban, **overlay** kotak deteksi dan skor kepercayaan, lalu **crop** ke **html5-qrcode** untuk dekode.  
- Validasi teks hasil baca terhadap **regex** nomor seri Panasonic (10 karakter sesuai aturan tahun/bulan/urutan).  
- Dukungan **multi-scan** per sesi dengan ringkasan daftar dan tombol selesai (selaras dengan alur bisnis satu kendaraan banyak unit).

### 3.4 Dasbor realtime manajer

- Halaman **`/dashboard`**: ringkasan pengiriman terbaru dan statistik **hari ini** (jumlah pengiriman, total unit, jumlah toko).  
- **Supabase Realtime**: kanal `dashboard-pengiriman` memicu **refresh** data saat ada perubahan pada tabel terkait (implementasi di `src/app/dashboard/page.tsx`).

### 3.5 Manajemen data pengiriman

- **`/dashboard/daftar-pengiriman`**: daftar rekaman pengiriman.  
- **`/dashboard/daftar-pengiriman/[id]`**: detail per pengiriman (untuk traceability).

### 3.6 Rekap & analitik

- **`/dashboard/rekap`**: agregasi menurut rentang waktu, **grafik** (batang, garis, pai) memakai **Recharts**, serta **ekspor PDF** (jsPDF) dan **Excel** (SheetJS / xlsx).

---

## 4. Struktur Database

> **Catatan:** Migrasi repositori (`supabase/migrations/`) mengasumsikan keberadaan tabel inti **`pengiriman`** dan **`detail_pengiriman`**. Skrip menambahkan kolom, membuat **`nomor_seri`**, dan fungsi **`submit_pengiriman_staff`**. Definisi lengkap tabel induk dapat disesuaikan dengan kebijakan RLS di proyek Supabase Anda.

### 4.1 Tabel `profiles`

| Field (konseptual) | Penjelasan |
|--------------------|------------|
| `id` | UUID, mengacu pada pengguna Supabase Auth (`auth.users`). |
| `role` | Teks: `staff` atau `manager`; menentukan akses rute aplikasi. |

### 4.2 Tabel `pengiriman`

| Field (digunakan RPC) | Penjelasan |
|------------------------|------------|
| `id` | UUID, primary key header pengiriman. |
| `toko_tujuan` | Nama/cabang toko penerima. |
| `nomor_kendaraan` | Identitas armada pengiriman. |
| `tanggal_pengiriman` | Tanggal kejadian (tipe `date`). |
| `catatan` | Teks opsional (ditambahkan migrasi jika belum ada). |
| `status` | Misalnya `dalam_perjalanan` (nilai default saat insert RPC). |

### 4.3 Tabel `detail_pengiriman`

| Field | Penjelasan |
|-------|------------|
| `id` | UUID, primary key baris detail. |
| `pengiriman_id` | Foreign key ke `pengiriman.id`. |
| `tipe_mesin` | Kode tipe mesin cuci (kolom ditambahkan migrasi bila perlu). |
| `jumlah` | Jumlah unit pada baris tersebut (diset RPC sesuai panjang array serial). |

### 4.4 Tabel `nomor_seri`

| Field | Penjelasan |
|-------|------------|
| `id` | UUID. |
| `detail_pengiriman_id` | Foreign key ke `detail_pengiriman.id`, **ON DELETE CASCADE**. |
| `nomor_seri` | Teks 10 karakter (setelah normalisasi/validasi di aplikasi). |

### 4.5 Relasi antar tabel

```
pengiriman (1) ──< (N) detail_pengiriman (1) ──< (N) nomor_seri
      ▲
      │ (profil pengguna terpisah)
profiles.id → auth.users
```

### 4.6 Field penting lainnya

- **`submit_pengiriman_staff`**: parameter `p_details` berbentuk **JSON array** `{ "tipe": string, "serials": string[] }[]`; fungsi melakukan validasi, insert bertingkat, dan mengembalikan **`uuid`** header pengiriman.

---

## 5. Alur Sistem (Flow)

### 5.1 Login & autentikasi

1. Pengguna mengakses aplikasi → tanpa sesi diarahkan ke **`/login`**.  
2. Setelah login sukses, halaman **`/`** membaca **`profiles.role`**: manajer ke **`/dashboard`**, staf ke **`/input`**.  
3. Middleware memvalidasi sesi dan peran pada setiap akses ke `/dashboard` dan `/input`.

### 5.2 Input pengiriman & scan barcode

1. Staf mengisi metadata pengiriman dan menambah baris per **tipe mesin**.  
2. Nomor seri dapat dimasukkan manual atau melalui **scan** (kamera + YOLO + html5-qrcode).  
3. Aplikasi memvalidasi format dan duplikasi lintas baris sebelum kirim.  
4. Konfirmasi simpan memanggil RPC **`submit_pengiriman_staff`**; sukses mengosongkan form dan menampilkan pesan.

### 5.3 Monitoring manajer

1. Manajer membuka **`/dashboard`**; data diambil dari Supabase dan diperbarui saat ada event Realtime.  
2. Drill-down ke daftar dan detail pengiriman sesuai kebutuhan operasional.

### 5.4 Ekspor data

1. Pada **`/dashboard/rekap`**, manajer memilih periode (tahun/bulan).  
2. Sistem menghitung agregat di klien dari dataset yang diambil (dengan batas fetch yang dikonfigurasi di kode).  
3. Pengguna dapat mengunduh **PDF** atau **Excel** hasil ringkasan/analitik.

---

## 6. Implementasi YOLOv8

### 6.1 Dataset

Kumpulan **foto barcode nomor seri Panasonic** pada stiker kemasan (variasi pencahayaan, sudut, dan jarak), disiapkan untuk pelatihan deteksi objek tunggal (kelas barcode/stiker).

### 6.2 Preprocessing & augmentasi

Pipeline anotasi dan augmentasi dilakukan dengan bantuan platform seperti **Roboflow** (resize, flip, variasi cahaya, dll.) agar model tahan kondisi lapangan.

### 6.3 Metrik pelatihan (contoh pelaporan skripsi)

| Metrik | Nilai |
|--------|--------|
| Precision | 99,2% |
| Recall | 88,9% |
| mAP@0,5 | 88,6% |

### 6.4 Export ONNX & inferensi peramban

Model diekspor ke format **ONNX** dan disajikan statis di **`public/models/barcode-detector.onnx`**. Pada klien, **ONNX Runtime Web** (WASM) menjalankan inferensi; konfigurasi **webpack** proyek mengalias modul ke **`ort.min.js`** agar kompatibel dengan bundler Next.js (menghindari error terkait `import.meta`).

### 6.5 Integrasi dengan html5-qrcode

Koordinat kotak dengan **confidence** di atas ambang (mis. 0,5) dipetakan ke koordinat video, **dicrop**, lalu diteruskan ke **html5-qrcode** untuk dekode **Code 128** (dan format lain yang dikonfigurasi). Teks hasil baca difilter dengan **regex** nomor seri sebelum dimasukkan ke daftar scan.

---

## 7. Cara Instalasi & Setup

### 7.1 Prerequisites

- **Node.js** (disarankan LTS) dan **npm**.  
- Akun **Supabase** dengan proyek PostgreSQL.  
- Akun **Vercel** (opsional, untuk deployment).

### 7.2 Clone & instal dependensi

```bash
git clone <url-repositori>
cd pengiriman-internal
npm install
```

### 7.3 Setup Supabase (skema SQL)

1. Buat tabel **`profiles`** (minimal kolom `id`, `role`) terhubung ke pengguna.  
2. Pastikan tabel **`pengiriman`** dan **`detail_pengiriman`** memenuhi kebutuhan RPC (lihat migrasi).  
3. Jalankan isi berkas **`supabase/migrations/20260404140000_submit_pengiriman_staff.sql`** di **SQL Editor** Supabase (atau `supabase db push`).  
4. Konfigurasi **Row Level Security** dan kebijakan sesuai kebijakan perusahaan.  
5. Aktifkan **Realtime** pada tabel yang dilanggan di dasbor (mis. `pengiriman` / terkait).

### 7.4 Environment variables

Buat berkas **`.env.local`** di root proyek:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

> Jangan mengunggah kunci rahasia ke repositori publik.

### 7.5 Menjalankan lingkungan pengembangan

```bash
npm run dev
```

Buka `http://localhost:3000`. Pastikan model ONNX dapat diunduh oleh peramban (dan jalur WASM ONNX Runtime dapat diakses sesuai konfigurasi proyek).

### 7.6 Deployment ke Vercel

1. Hubungkan repositori ke **Vercel**.  
2. Set environment variables yang sama seperti `.env.local`.  
3. Deploy; periksa bahwa aset **`/models/barcode-detector.onnx`** tersedia di produksi.

---

## 8. Rencana Pengembangan

1. **Penambahan dan diversifikasi dataset** guna menaikkan **recall** pada kondisi ekstrim (malam, silau, stiker rusak).  
2. **Notifikasi realtime** (push atau email) ketika volume harian melampaui ambang atau terjadi anomaly.  
3. **Aplikasi mobile native** atau PWA teroptimal untuk kamera dan performa di lapangan.  
4. **Integrasi ERP** perusahaan untuk sinkronisasi stok, faktur, dan master toko.

---

## 9. Referensi Teknologi

Versi mengacu pada **`package.json`** proyek (rentang semver ditulis sebagaimana di berkas).

### 9.1 Dependencies

| Paket | Versi |
|-------|--------|
| @radix-ui/react-avatar | ^1.1.11 |
| @radix-ui/react-dialog | ^1.1.15 |
| @radix-ui/react-dropdown-menu | ^1.1.16 |
| @radix-ui/react-label | ^1.1.8 |
| @radix-ui/react-select | ^2.2.6 |
| @radix-ui/react-separator | ^1.1.8 |
| @radix-ui/react-slot | ^1.2.4 |
| @radix-ui/react-tabs | ^1.1.13 |
| @supabase/ssr | ^0.10.0 |
| @supabase/supabase-js | ^2.101.1 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| html5-qrcode | ^2.3.8 |
| jspdf | ^4.2.1 |
| lucide-react | ^1.7.0 |
| next | 14.2.35 |
| onnxruntime-web | ^1.24.3 |
| opencv.js | ^1.2.1 |
| radix-ui | ^1.4.3 |
| react | ^18 |
| react-dom | ^18 |
| recharts | ^3.8.1 |
| shadcn | ^4.1.2 |
| tailwind-merge | ^3.5.0 |
| tesseract.js | ^7.0.0 |
| tw-animate-css | ^1.4.0 |
| xlsx | ^0.18.5 |

### 9.2 DevDependencies

| Paket | Versi |
|-------|--------|
| @types/node | ^20 |
| @types/react | ^18 |
| @types/react-dom | ^18 |
| eslint | ^8 |
| eslint-config-next | 14.2.35 |
| postcss | ^8 |
| tailwindcss | ^3.4.1 |
| typescript | ^5 |

### 9.3 Dependensi transitif relevan (inferensi & tipe)

| Paket | Peran |
|-------|--------|
| onnxruntime-common | Tipe API bersama ONNX Runtime (mis. `InferenceSession` pada kode klien). |
| zxing (melalui html5-qrcode) | Dekode barcode pada lapisan html5-qrcode. |

---

## Konteks bisnis (ringkas)

- **Produk:** mesin cuci Panasonic; **barcode** Code 128 pada stiker putih.  
- **Front load:** stiker di **samping** dus; **top load:** stiker di **depan** dus — diarahkan dalam UI input pemindaian.  
- **Format nomor seri:** 2 digit tahun + 1 karakter bulan (`1`–`9` atau `O`/`N`/`D`) + 7 digit urutan (**10 karakter**).  
- **Pengguna:** staf di **gudang/truk**; manajer di **kantor** untuk monitoring dan rekap.

---

*Dokumen ini dapat dikembangkan menjadi bab metodologi, analisis kebutuhan, perancangan basis data, dan evaluasi pada naskah skripsi.*

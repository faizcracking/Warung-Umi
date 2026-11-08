# WARUNG UMI - Toko Kelontong Online

Website toko kelontong keluarga (mini marketplace). Pelanggan memilih produk, memasukkan ke keranjang,
lalu pesanan disimpan ke database dan dikirim lewat **WhatsApp** (tanpa payment gateway).
Admin (Ibu) mengelola produk, harga, promo, stok, kategori, pesanan, dan pengaturan toko lewat dashboard.

- Nomor WhatsApp bawaan: **085213205216** (`https://wa.me/6285213205216`), bisa diubah di dashboard admin.
- Teknologi: HTML/CSS/JavaScript, Node.js (Vercel Functions), Supabase (PostgreSQL + Auth + Storage), Vercel, GitHub.

> **Status pengujian (jujur):** unit test rumus promo & pesan WhatsApp sudah dijalankan dan lolos (`npm test`),
> dan seluruh file JavaScript lolos pemeriksaan sintaks. Project ini **belum dijalankan terhadap Supabase/Vercel asli**
> oleh pembuatnya. Ikuti langkah "Uji setelah deploy" di bawah untuk memastikan semuanya berjalan di akun Anda.

---

## Fitur

**Customer (tanpa login):** beranda (banner, kategori, produk diskon/populer/terbaru/rekomendasi), katalog
(cari, filter kategori, urut harga/diskon, indikator stok habis), halaman Promo (Produk Diskon, Promo Terbaru,
Paling Hemat), keranjang (tersimpan di `localStorage`), checkout -> simpan pesanan -> buka WhatsApp.

**Promo ala Shopee:** harga normal dicoret, harga promo besar, badge `-20%`, label PROMO, tanggal mulai & berakhir.
Rumus: `Harga Promo = Harga Normal - (Harga Normal x Persentase Diskon / 100)`.
Promo yang sudah berakhir otomatis kembali ke harga normal. Harga normal tidak pernah ditimpa.

**Admin:** login username+password, ringkasan statistik, CRUD produk (foto, harga, stok, kategori, deskripsi,
aktif/nonaktif, diskon), CRUD kategori, daftar pesanan (status + tanda dibayar manual), pengaturan toko
(nama, WhatsApp, alamat, deskripsi, banner), ganti password.

---

## Struktur folder

```
warung-umi/
├── api/                    Vercel Functions (backend)
│   ├── products.js         GET produk aktif (+ harga promo dihitung server)
│   ├── categories.js       GET kategori
│   ├── settings.js         GET pengaturan toko publik
│   ├── orders.js           POST pesanan (validasi ulang harga & stok)
│   └── admin/              SEMUA wajib login + role admin
│       ├── auth.js         login / refresh / me / ganti password / logout
│       ├── dashboard.js    statistik
│       ├── products.js     CRUD produk + promo
│       ├── categories.js   CRUD kategori
│       ├── orders.js       lihat & ubah status pesanan
│       ├── settings.js     ubah pengaturan toko
│       └── upload.js       unggah foto ke Supabase Storage
├── config/supabase.js      pembuat koneksi Supabase (anon / user / service role)
├── lib/                    pricing.js (rumus promo), auth.js, http.js, whatsapp.js
├── public/                 frontend statis (HTML/CSS/JS), admin di public/admin/
├── database/schema.sql     tabel + RLS + storage + data awal
├── scripts/create-admin.js membuat akun admin pertama
├── tests/pricing.test.js   unit test
├── .env.example  .gitignore  package.json  vercel.json
```

Struktur disesuaikan dari rancangan awal: ditambah `lib/`, `scripts/`, `tests/`, dan beberapa file `api/` (agar admin bisa
mengelola kategori, pesanan, pengaturan, dan upload). Total 11 function, masih di bawah batas paket gratis Vercel (12).

---

## Panduan lengkap (dari nol sampai online)

### 1. Instal Node.js
Unduh **Node.js 20 LTS** dari https://nodejs.org lalu instal. Cek di terminal: `node -v` (harus v20 atau lebih baru).

### 2. Buka project di VS Code
Ekstrak ZIP -> buka VS Code -> **File > Open Folder** -> pilih folder `warung-umi`. Buka terminal (`Ctrl+``).

### 3. Instal dependency
```bash
npm install
npm test        # opsional: menjalankan unit test
```

### 4. Buat project Supabase
1. Daftar di https://supabase.com -> **New project** (simpan database password).
2. Buka **Project Settings > API**, catat: **Project URL**, **anon public key**, dan **service_role key**.
3. Buka **Authentication > Sign In / Providers** (atau Settings) dan **matikan "Allow new users to sign up"**
   agar tidak ada registrasi publik.

### 5. Jalankan SQL schema
Supabase -> **SQL Editor > New query** -> salin seluruh isi `database/schema.sql` -> **Run**.
Ini membuat 6 tabel, kebijakan RLS, bucket Storage `store-assets`, 8 kategori awal, pengaturan toko, dan
**6 produk CONTOH** (hapus/ubah lewat dashboard). Tidak ada data pesanan contoh.

### 6. Atur Supabase Storage
Bucket `store-assets` (publik untuk dibaca, hanya admin yang boleh mengunggah) sudah dibuat oleh schema.sql.
Cek di **Storage**: bucket `store-assets` harus ada. Jika belum, buat manual dengan nama itu, centang *Public bucket*,
lalu jalankan ulang bagian STORAGE di schema.sql.

### 7. Buat akun admin pertama
```bash
cp .env.example .env        # Windows: copy .env.example .env
```
Isi `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dan:
```
ADMIN_USERNAME=admin123
ADMIN_INITIAL_PASSWORD=admin123
```
Lalu jalankan:
```bash
npm run create-admin
```
Cara kerja login: Supabase Auth memakai email, jadi script membuat akun dengan email teknis
(`admin123@warungumi.site`) dan menyimpan pemetaan **username -> akun** di tabel `profiles` dengan role `admin`.
Saat login, server mencari email dari username, lalu memverifikasi password lewat Supabase Auth
(password di-hash oleh Supabase, tidak ada di kode maupun database kita).
Jika Supabase menolak email tersebut, isi `ADMIN_EMAIL` dengan email apa pun lalu jalankan ulang.

**PENTING:** `admin123/admin123` hanya untuk setup dan uji coba. Dashboard **memaksa ganti password** saat login pertama
(minimal 10 karakter, harus ada huruf dan angka). Setelah itu hapus `ADMIN_INITIAL_PASSWORD` dari `.env`.

### 8. Atur environment variables
Lokal: file `.env` (sudah di-.gitignore, tidak ikut ke GitHub).
Di Vercel (langkah 11) isi tiga variabel ini: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
`SUPABASE_SERVICE_ROLE_KEY` bersifat rahasia: jangan dibagikan, jangan ditaruh di folder `public/`.

Jalankan lokal (opsional): `npm install -g vercel`, lalu `vercel dev` dan buka http://localhost:3000.

### 9. Unggah ke GitHub
```bash
git init
git add .
git commit -m "Warung Umi pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/warung-umi.git
git push -u origin main
```
(Buat dulu repository kosong `warung-umi` di github.com. Pastikan `.env` tidak terlihat di `git status`.)

### 10. Hubungkan GitHub ke Vercel
https://vercel.com -> **Add New > Project** -> import repository `warung-umi`.
Framework Preset: **Other**. Biarkan Build Command kosong. Output directory sudah diatur di `vercel.json` (`public`).

### 11. Deploy
Sebelum menekan **Deploy**, buka **Environment Variables** dan isi tiga variabel pada langkah 8. Lalu **Deploy**.
Jika lupa mengisi, tambahkan di **Settings > Environment Variables** lalu **Redeploy**.

### 12. Uji website online (checklist)
- [ ] Beranda terbuka, ada kategori & produk contoh, logo tampil.
- [ ] `/products`: cari, filter kategori, urut harga berfungsi; produk stok 0 tampil "Stok habis".
- [ ] `/promo`: Gula & Mie contoh tampil dengan harga dicoret + badge diskon.
- [ ] Tambah produk ke keranjang -> `/cart` -> ubah jumlah -> `/checkout`.
- [ ] Checkout membuat kode pesanan lalu membuka WhatsApp 6285213205216 dengan pesan lengkap.
- [ ] `/admin/login` login `admin123` -> dipaksa ganti password -> dashboard terbuka.
- [ ] Pesanan tadi muncul di menu **Pesanan**; ubah status berfungsi.
- [ ] Tambah produk + unggah foto + aktifkan diskon; langsung terlihat di toko.
- [ ] Buka `/admin/dashboard` di jendela samaran (belum login) -> diarahkan ke login.
- [ ] Akses `/api/admin/products` tanpa login -> respons 401.

---

## Keamanan

- Password di-hash oleh Supabase Auth; tidak ada password/API key rahasia di source code atau ZIP.
- Service Role Key hanya di server (`api/`), tidak pernah dikirim ke browser. Frontend bahkan tidak memerlukan anon key.
- Setiap endpoint admin memanggil `requireAdmin()`: memverifikasi token, lalu memeriksa `role = 'admin'` di tabel `profiles`.
  Akun non-admin yang berhasil login tetap ditolak (403).
- Query admin dijalankan atas nama admin yang login, sehingga **Row Level Security** Supabase ikut melindungi data.
  RLS: publik hanya membaca produk aktif, kategori, dan pengaturan toko; tabel `orders`/`order_items`/`profiles` tertutup untuk publik.
- Role admin tidak bisa ditentukan sendiri: tabel `profiles` tidak punya policy insert/update untuk pengguna biasa.
- Harga tidak dipercaya dari browser: keranjang hanya menyimpan id + jumlah; `/api/orders` menghitung ulang harga, promo, dan stok.
- Input divalidasi di frontend dan backend; teks dibersihkan, dan semua output di-escape (anti XSS). Upload foto dicek tipe, ukuran, dan isi file.
- Honeypot anti-bot di form checkout. Untuk perlindungan tambahan terhadap spam, aktifkan Vercel Firewall / Attack Challenge Mode.
- Catatan: token sesi admin disimpan di `localStorage` browser. Jangan login admin di komputer umum, dan selalu klik **Keluar**.
- Stok dikurangi **manual** oleh admin (tidak otomatis saat pesanan masuk), karena pesanan baru final setelah dikonfirmasi lewat WhatsApp.

## Cara kerja pesanan & WhatsApp
1. Customer submit checkout -> server memvalidasi & menyimpan pesanan (status **Menunggu konfirmasi**, **belum dibayar**).
2. Server membuat pesan WhatsApp (harga normal, diskon, harga promo, jumlah, total) dan mengembalikan link `wa.me` ter-encode.
3. Customer diarahkan ke WhatsApp. Jika customer menutup WhatsApp, pesanan tetap tercatat di dashboard.
4. Jika penyimpanan gagal, customer diberi tahu bahwa pesanan **belum tersimpan** (tidak ada pesan WA palsu).
5. Status "Dibayar" hanya diubah admin secara manual.

## Pemecahan masalah
| Masalah | Solusi |
|---|---|
| Produk tidak tampil / error 500 | Cek 3 environment variables di Vercel, lalu Redeploy. Pastikan schema.sql sudah dijalankan. |
| `create-admin` gagal membuat user | Periksa `.env`; coba isi `ADMIN_EMAIL` dengan email lain. |
| Login "Username atau password salah" | Pastikan `create-admin` sukses (profil ada di tabel `profiles` dengan role `admin`). |
| Upload foto gagal | Pastikan bucket `store-assets` ada dan policy storage dari schema.sql sudah dijalankan. |
| `npm run create-admin` error `--env-file` | Perbarui Node.js ke versi 20.6 atau lebih baru. |

## Pengembangan lanjutan (ide)
Pengurangan stok otomatis, kode kupon, ongkos kirim, notifikasi email/WA ke admin, laporan penjualan, banyak foto per produk.

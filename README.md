# Sales Visit Camera

Web app/PWA untuk mengambil atau memilih foto kunjungan sales, lalu menempelkan watermark profesional yang hanya berisi **nama toko** dan **nama sales**.

## Fitur
- Pengaturan nama sales dan nama perusahaan opsional.
- Input nama toko dengan saran dari riwayat foto.
- Kamera belakang dan kamera depan.
- Pilih foto dari galeri.
- Lokasi GPS opsional dan input lokasi manual.
- Tanggal dan waktu otomatis yang bisa diedit.
- Watermark dapat diubah sebelum foto disimpan/dibagikan.
- Pilihan posisi atas/bawah dan gaya gelap/terang.
- Unduh JPEG dan berbagi file melalui fitur berbagi browser jika didukung.
- Riwayat foto lokal menggunakan IndexedDB.
- PWA dengan cache dasar untuk akses offline.

## Cara publikasi di GitHub Pages
1. Buat repository GitHub baru, misalnya `sales-visit-camera`.
2. Unggah semua file dan folder dari paket ini ke root repository.
3. Buka **Settings → Pages**.
4. Pada bagian **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch `main` dan folder `/ (root)`, lalu tekan **Save**.
6. Tunggu sampai GitHub Pages menampilkan alamat situs. Buka alamat tersebut melalui Chrome di HP Android.

## Cara menggunakan
1. Buka aplikasi dan pilih **Pengaturan**.
2. Isi nama sales, lalu simpan.
3. Pilih **Foto Kunjungan**, masukkan nama toko, cek nama sales, tanggal/waktu, dan bila diperlukan ambil GPS.
4. Tekan **Lanjut ke Kamera**.
5. Gunakan tombol bulat besar untuk mengambil foto.
6. Tombol tukar kamera mengganti kamera belakang/depan. Tombol galeri memilih foto yang sudah ada.
7. Di pratinjau, ubah nama toko atau sales jika diperlukan. Watermark hanya memuat dua informasi tersebut.
8. Pilih **Simpan Foto** atau **Bagikan Foto**.

## Persyaratan dan batasan
- Kamera dan GPS membutuhkan izin browser. Kamera web umumnya memerlukan HTTPS atau `localhost`; GitHub Pages menyediakan HTTPS.
- Berbagi file memerlukan browser/perangkat yang mendukung Web Share API. Jika tidak tersedia, aplikasi mengunduh foto agar bisa dilampirkan secara manual ke WhatsApp.
- Foto dan riwayat disimpan pada browser/perangkat lokal. Data bukan backup online dan dapat hilang jika data situs/browser dihapus.
- Service worker menyimpan aset dasar aplikasi untuk akses offline setelah situs berhasil dibuka secara online setidaknya sekali.
- Lokasi GPS dicatat dalam data kunjungan, tetapi tidak ditampilkan pada watermark karena watermark diminta hanya berisi nama toko dan nama sales.
- Tanggal dan waktu watermark tidak ditampilkan; tanggal/waktu tetap disimpan dalam metadata riwayat aplikasi.

## Privasi
Aplikasi tidak memiliki backend dan tidak mengunggah foto atau data ke server. Akses kamera dan lokasi hanya dilakukan setelah pengguna memulai fitur terkait dan memberi izin browser.

## Pengembangan lokal
Untuk menguji kamera, jalankan situs melalui server lokal (localhost), bukan dengan membuka `index.html` sebagai file langsung. Contoh jika Python tersedia:

```bash
python -m http.server 8000
```

Kemudian buka `http://localhost:8000`.

## Lisensi
MIT. Lihat file `LICENSE`.

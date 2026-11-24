# Panduan agen — Log Harian Nepal v2

Berlaku untuk **agen mana pun (Claude utama, Hermes cadangan)** — THE BRAIN §5.15.
Halaman: https://adib-psych.github.io/log-harian-nepal/ · Data: Firestore proyek `log-harian-nepal` (asia-south1).

## Satu sumber, satu buku aturan
- Data hanya di Firestore. Repo ini berisi kode saja; **jangan pernah commit data, cadangan, atau kunci**.
- Rumus (kurs per tanggal, jatah other costs, ringkasan) ada di `js/aturan.js` dan padanannya `alat/aturan.py`.
  Keduanya dikunci tes: `node tes/tes_aturan.mjs && python3 tes/tes_aturan.py`. Ubah keduanya bersamaan.
- Kurs: kurs terakhir yang tanggalnya ≤ tanggal transaksi (NRB untuk NPR/USD, BI nilai tengah untuk IDR).
  Mata uang tanpa kurs (mis. SGD) **tidak dianggap nol** — `ringkas` menampilkannya di `tanpaKurs`.

## Jejak perubahan (wajib)
Setiap tulisan menyimpan `_oleh`, `_waktu` (waktu server), `_lewat`, `_alasan`, dan menambah satu dokumen
di koleksi `jejak` (tidak bisa diubah/dihapus). Alasan ditulis konkret: siapa yang minta dan dari bukti apa.

## Jalur tulis
| Agen | Jalur | Cara |
|---|---|---|
| Adib | Halaman | Masuk dengan Google |
| Claude | Halaman lewat Claude in Chrome (akun Google Adib sudah masuk) | `await LH.tulisEntri({...}, "alasan")`, `LH.tulisHari`, `LH.tulisKurs`, `LH.hapusEntri`, `LH.ringkas()`, `await LH.sidik()` |
| Hermes | `alat/logharian.py` di Luna | `python3 alat/logharian.py ringkas` · `tulis entri <id> --json ... --alasan ...` · `kurs <tanggal> ...` · `cadangkan --ke ...` |

Bentuk entri: `{tanggal, kategori, jumlah, mataUang, perlakuan, ket, lampiran:[]}`
— kategori: makan, transport, belanja, komunikasi, akomodasi, tiket, visa, kerja, lain;
perlakuan: oc (jatah other costs), rvo, who, cek (belum pasti), pribadi.

## Tab Pembayaran (25 Nov 2026)
- Data: koleksi `pembayaran/{id}` (nomor, jenis, periode, totalBiayaEUR, jumlahEUR, hariFee, diajukan, status dibayar|diajukan, tanggalBayar, diterimaIDR, catatan) dan `config/kontrak` (plafonEUR, akhir, invoiceSampai, libur, hariFeeAnggaran, akomodasiProyeksiEUR, lainProyeksiEUR, catatan).
- Rumus: `proyeksiSisa` + `posisiPembayaran` di `js/aturan.js` (padanan Python di `alat/aturan.py`).
- Setelah invoice baru diajukan: tambah dokumen `pembayaran` berstatus `diajukan`, lalu perbarui `config/kontrak.invoiceSampai` ke akhir periode invoice itu. Status `dibayar`, tanggal dan nominal Rupiah = ranah Adib (dari mutasi bank atau konfirmasi Adib).

## Sinkron mingguan (Hermes)
Setiap Senin pagi Hermes menjalankan `cadangkan` lalu langkah Excel di `Financial Report ADB/Nepal RVO 2026/Prompt Sinkron Mingguan v2.md` (keputusan Adib 25 Nov 2026).

## Kunci Hermes
Service account dibuat di konsol Firebase (Project settings → Service accounts → Generate new private key).
Simpan di `~/.config/log-harian-nepal/kunci.json` dengan `chmod 600`. Jangan dipindah ke folder Claude, repo, chat, atau Thar Lay.

## Ranah Adib (tanya dulu, pilihan ganda + rekomendasi)
Isi dan kebenaran data, uang, menghapus data, perlakuan yang belum pasti (`cek`), biaya baru.
Agen boleh mencatat apa yang Adib sampaikan atau bukti yang jelas; koreksi/hapus hanya atas keputusan Adib.

## Jangan diulang
- Jangan menulis ke artifact v1 (claude.ai) lagi — itu arsip baca-saja sejak migrasi.
- Jangan menulis dashboard lewat Safari/JavaScript tanpa login (penyebab HTTP 401 di v1).

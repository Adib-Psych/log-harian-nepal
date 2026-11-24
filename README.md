# Log Harian Nepal v2

Catatan harian penugasan MHPSS Surge (RVO) di WHO Nepal: jenis hari kerja, belanja, nota, dan sisa jatah *other costs*.

- **Tampilan:** GitHub Pages (repo ini, kode saja).
- **Data:** Firestore proyek `log-harian-nepal` — hanya akun yang didaftarkan di `akses/{uid}`.
- **Agen:** Claude dan Hermes menulis langsung lewat jalur resmi; lihat [AGEN.md](AGEN.md).
- **Aturan akses:** [firestore.rules](firestore.rules).
- **Tes:** `node tes/tes_aturan.mjs && python3 tes/tes_aturan.py`.

Pengganti artifact claude.ai "Log Harian Nepal" (v1), yang dibekukan sebagai arsip baca-saja.

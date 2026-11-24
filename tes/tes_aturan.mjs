// node tes/tes_aturan.mjs — menghitung keluaran acuan dari js/aturan.js
import * as A from "../js/aturan.js";
import { readFileSync, writeFileSync } from "node:fs";
const v = JSON.parse(readFileSync(new URL("./vektor.json", import.meta.url)));
const out = {
  ringkas: A.ringkas({ cfg: v.cfg, kurs: v.kurs, hari: new Map(Object.entries(v.hari)), entri: new Map(Object.entries(v.entri)) }),
  kanonik: v.kanonik_kasus.map(A.kanonik),
  sisa: A.proyeksiSisa({ hari: new Map(Object.entries(v.hari)) }, v.kontrak, v.cfg),
  rate: ["2026-09-01", "2026-09-15", "2026-10-02", "2026-10-04", "2027-01-01"].map(d => A.rateFor(v.kurs, v.cfg, d)).map(r => [r.npr, r.idr, r.usd]),
};
out.posisi = A.posisiPembayaran(v.pembayaran, v.kontrak, out.sisa);
// kunci yang dikenal: angka harus cocok dengan perhitungan tangan
const r = out.ringkas;
const cek = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("GAGAL", n, a, b); process.exit(1); } };
cek("hari", r.jumlahHari, 4); cek("entri", r.jumlahEntri, 5); cek("billable", r.billable, 3);
cek("tanpaKurs SGD", r.tanpaKurs, ["e4"]);
cek("jatah", r.jatahEUR, 83 * 5 + 38); // ktm: 09-12 (tiba), 09-14, 09-30, 10-02, 10-05 · nepal: 09-20 · luar: 09-10
cek("sisa tercatat (2 Okt libur)", out.sisa.feeTercatat, 0); cek("hari tanpa catatan", out.sisa.hariTanpaCatatan, 9);
cek("fee perkiraan (Minggu libur, hari akhir dihitung)", out.sisa.feePerkiraan, 8);
writeFileSync(new URL("./keluaran_js.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("OK js", JSON.stringify(out.ringkas));

// Buku aturan Log Harian Nepal — satu sumber rumus untuk halaman, tes, dan agen.
// Padanan Python: alat/aturan.py (dikunci oleh tes/vektor.json; ubah keduanya bersama).

export const BILL = new Set(["kerja", "remote", "travel"]);
export const CATS = [["makan","Makan","oc"],["transport","Transport lokal","oc"],["belanja","Belanja kebutuhan","oc"],["komunikasi","Pulsa & internet","oc"],["akomodasi","Akomodasi","rvo"],["tiket","Tiket & bandara","rvo"],["visa","Visa & medis","rvo"],["kerja","Keperluan kerja","cek"],["lain","Lain-lain","pribadi"]];
export const CATL = Object.fromEntries(CATS.map(c => [c[0], c[1]]));
export const CATP = Object.fromEntries(CATS.map(c => [c[0], c[2]]));
export const PER = { oc: "Jatah other costs", rvo: "Klaim RVO", who: "Klaim WHO", cek: "Belum pasti", pribadi: "Pribadi" };
export const MATA_UANG = ["NPR", "IDR", "USD", "EUR", "SGD"];

// kurs: array terurut naik menurut tanggal; tiap item {tanggal, nprPerEur?, idrPerEur?, usdPerEur?, ...}
// Aturan: kurs terakhir yang tanggalnya <= tanggal transaksi; bila tidak ada, kurs pertama yang tersedia.
export function pick(kurs, d, f) {
  let v = null;
  for (const k of kurs) { if (k.tanggal <= d && k[f]) v = k; else if (k.tanggal > d) break; }
  if (!v) v = kurs.find(k => k[f]) || null;
  return v;
}

export function rateFor(kurs, cfg, d) {
  const n = pick(kurs, d, "nprPerEur"), i = pick(kurs, d, "idrPerEur"), u = pick(kurs, d, "usdPerEur");
  return {
    npr: n ? n.nprPerEur : (cfg && cfg.nprPerEur) || 0,
    idr: i ? i.idrPerEur : (cfg && cfg.idrPerEur) || 0,
    usd: u ? u.usdPerEur : (cfg && cfg.usdPerEur) || 0,
    tN: n ? n.tanggalNpr || n.tanggal : null,
    tI: i ? i.tanggalIdr || i.tanggal : null,
    resmi: !!n,
  };
}

// Mata uang tanpa kurs (mis. SGD) mengembalikan null, bukan 0: jangan dianggap nol biaya.
export function toEUR(kurs, cfg, a, cur, d) {
  const r = rateFor(kurs, cfg, d);
  if (cur === "EUR") return a;
  if (cur === "NPR") return r.npr ? a / r.npr : null;
  if (cur === "IDR") return r.idr ? a / r.idr : null;
  if (cur === "USD") return r.usd ? a / r.usd : null;
  return null;
}

export function lokasiMalam(hari, cfg, d) {
  const h = hari.get ? hari.get(d) : hari[d];
  if (h && h.lokasi) return h.lokasi;
  return cfg && d >= cfg.tiba ? "ktm" : "luar";
}

export function jatahEUR(hari, cfg, d) {
  if (!cfg) return 0;
  const l = lokasiMalam(hari, cfg, d);
  return l === "ktm" ? cfg.ocKtm : l === "nepal" ? cfg.ocNepal : 0;
}

// Ringkasan yang dipakai untuk verifikasi migrasi dan laporan agen.
// Angka mentah per mata uang (tanpa kurs) + EUR per perlakuan.
export function ringkas(st) {
  const { cfg, kurs } = st;
  const hari = st.hari instanceof Map ? st.hari : new Map(Object.entries(st.hari || {}));
  const entri = (st.entri instanceof Map ? [...st.entri.entries()] : Object.entries(st.entri || {}))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([id, e]) => Object.assign({ id }, e));
  const mentah = {}, eur = {}, tanpaKurs = [];
  for (const e of entri) {
    const k = `${e.perlakuan}|${e.mataUang}`;
    mentah[k] = round2((mentah[k] || 0) + Number(e.jumlah || 0));
    const v = toEUR(kurs, cfg, Number(e.jumlah || 0), e.mataUang, e.tanggal);
    if (v === null) tanpaKurs.push(e.id); else eur[e.perlakuan] = (eur[e.perlakuan] || 0) + v;
  }
  for (const p in eur) eur[p] = round2(eur[p]);
  const hariSet = new Set([...hari.keys(), ...entri.map(e => e.tanggal)]);
  let jatah = 0; hariSet.forEach(d => { jatah += jatahEUR(hari, cfg, d); });
  const billable = [...hari.values()].filter(h => BILL.has(h.jenis)).length;
  return { jumlahHari: hari.size, jumlahEntri: entri.length, jumlahKurs: kurs.length, billable,
    jatahEUR: round2(jatah), mentah, eur, tanpaKurs: tanpaKurs.sort() };
}

export const round2 = n => Math.round(n * 100) / 100;

// Bentuk kanonik untuk membandingkan isi data (abaikan kolom jejak berawalan "_").
export function kanonik(v) {
  if (Array.isArray(v)) return "[" + v.map(kanonik).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).filter(k => !k.startsWith("_")).sort().map(k => JSON.stringify(k) + ":" + kanonik(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// ---------- Pembayaran & proyeksi sampai akhir kontrak ----------
// kontrak: {plafonEUR, akhir, invoiceSampai, hariKerjaPerMinggu, libur:[0..6], akomodasiProyeksiEUR, lainProyeksiEUR}
// Hari setelah invoice terakhir: yang sudah dicatat memakai jenis & lokasinya; yang belum dicatat diperkirakan
// (hari kerja kecuali hari libur mingguan; hari terakhir = perjalanan pulang, dibayar fee).
export function proyeksiSisa(st, kontrak, cfg) {
  const hari = st.hari instanceof Map ? st.hari : new Map(Object.entries(st.hari || {}));
  const fee = (cfg && cfg.feePerDay) || 0, libur = new Set(kontrak.libur || [0]);
  const out = { feeTercatat: 0, feePerkiraan: 0, hariTanpaCatatan: 0, ocEUR: 0, ocHari: 0 };
  const P = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  for (let t = P(kontrak.invoiceSampai).getTime() + 864e5; t <= P(kontrak.akhir).getTime(); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10), h = hari.get(d);
    if (h && h.jenis) { if (BILL.has(h.jenis)) out.feeTercatat++; }
    else { out.hariTanpaCatatan++; if (d === kontrak.akhir || !libur.has(new Date(t).getUTCDay())) out.feePerkiraan++; }
    const j = jatahEUR(hari, cfg, d); if (j) { out.ocEUR += j; out.ocHari++; }
  }
  out.feeEUR = (out.feeTercatat + out.feePerkiraan) * fee;
  out.akomodasiEUR = kontrak.akomodasiProyeksiEUR || 0;
  out.lainEUR = kontrak.lainProyeksiEUR || 0;
  out.totalEUR = round2(out.feeEUR + out.ocEUR + out.akomodasiEUR + out.lainEUR);
  return out;
}

export function posisiPembayaran(pembayaran, kontrak, sisa) {
  const list = [...pembayaran].sort((a, b) => (a.urut || 0) - (b.urut || 0));
  const dibayar = list.filter(p => p.status === "dibayar").reduce((s, p) => s + (p.jumlahEUR || 0), 0);
  const diajukan = list.filter(p => p.status === "diajukan").reduce((s, p) => s + (p.jumlahEUR || 0), 0);
  const terakhir = list.filter(p => p.totalBiayaEUR).slice(-1)[0];
  const biayaTerinvoice = terakhir ? terakhir.totalBiayaEUR : dibayar + diajukan;
  const proyeksiTotal = round2(biayaTerinvoice + sisa.totalEUR);
  return { dibayar: round2(dibayar), diajukan: round2(diajukan), biayaTerinvoice, proyeksiTotal,
    invoiceAkhir: round2(proyeksiTotal - dibayar - diajukan), ruangPlafon: round2(kontrak.plafonEUR - proyeksiTotal) };
}

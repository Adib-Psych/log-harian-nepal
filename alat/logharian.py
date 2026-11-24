#!/usr/bin/env python3
"""Alat baris perintah Log Harian Nepal v2 — jalur tulis langsung untuk agen di Luna (Hermes).

Kunci service account TIDAK disimpan di repo dan tidak pernah dikirim lewat chat.
Lokasi bawaan: ~/.config/log-harian-nepal/kunci.json (izin 600), atau variabel LH_KUNCI.

Pasang sekali:  python3 -m pip install --user firebase-admin

Contoh:
  logharian.py ringkas
  logharian.py baca entri --sejak 2026-11-20
  logharian.py tulis entri e123 --json '{"tanggal":"2026-11-24","kategori":"makan","jumlah":850,"mataUang":"NPR","perlakuan":"oc","ket":"Lunch"}' --alasan "Adib minta catat dari notifikasi eSewa 24 Nov"
  logharian.py hapus entri e123 --alasan "duplikat dari entri e122, dikonfirmasi Adib"
  logharian.py kurs 2026-11-25 --json '{"nprPerEur":158.2,"tanggalNpr":"2026-11-25"}' --alasan "kurs harian NRB"
  logharian.py cadangkan --ke "/Users/adibasrori/Documents/Claude/Financial Report ADB/Nepal RVO 2026/Cadangan Log Harian"
  logharian.py sidik

Setiap tulisan mengisi jejak (_oleh, _waktu, _lewat, _alasan) dan menambah satu dokumen di koleksi `jejak`,
sama seperti tulisan dari halaman. Alasan wajib diisi.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aturan  # noqa: E402

KOLEKSI = ("config", "hari", "entri", "kurs", "pembayaran")
OLEH = os.environ.get("LH_OLEH", "agen:hermes")


def klien():
    import firebase_admin
    from firebase_admin import credentials, firestore
    kunci = os.environ.get("LH_KUNCI", str(Path.home() / ".config/log-harian-nepal/kunci.json"))
    if not Path(kunci).exists():
        sys.exit(f"Kunci tidak ditemukan di {kunci}. Lihat AGEN.md bagian 'Kunci Hermes'.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(kunci))
    return firestore.client(), firestore


def muat(db):
    out = {}
    for k in KOLEKSI:
        out[k] = {d.id: d.to_dict() for d in db.collection(k).stream()}
    return out


def _bersih(o):
    return {k: v for k, v in o.items() if not k.startswith("_")}


def bentuk_halaman(raw):
    """Susun data persis seperti yang dilihat halaman (lihat boot di js/app.js)."""
    cfg = _bersih(raw["config"].get("params") or {}) or None
    hari = {}
    for i, v in raw["hari"].items():
        h = dict({"tanggal": i}, **v)
        hari[v.get("tanggal") or i] = h
    entri = {i: dict({"id": i}, **v) for i, v in raw["entri"].items()}
    kurs = sorted((dict({"tanggal": i}, **v) for i, v in raw["kurs"].items()), key=lambda x: x["tanggal"])
    return cfg, hari, entri, kurs


def _json(v):
    def conv(o):
        if hasattr(o, "isoformat"):
            return o.isoformat()
        raise TypeError(type(o))
    return json.dumps(v, ensure_ascii=False, indent=1, sort_keys=True, default=conv)


def sidik_dari(cfg, hari, entri, kurs):
    h = lambda s: hashlib.sha256(s.encode("utf-8")).hexdigest()  # noqa: E731
    ent = {i: {k: v for k, v in e.items() if k != "id"} for i, e in entri.items()}
    kr = {k["tanggal"]: k for k in kurs}
    return {"config": h(aturan.kanonik(cfg)), "hari": h(aturan.kanonik(hari)), "entri": h(aturan.kanonik(ent)),
            "kurs": h(aturan.kanonik(kr)), "jumlah": {"hari": len(hari), "entri": len(entri), "kurs": len(kurs)}}


def tulis(db, fs, path, body, alasan, aksi="tulis"):
    if not alasan or len(alasan.strip()) < 5:
        sys.exit("--alasan wajib diisi (siapa minta / kenapa).")
    jejak = {"_oleh": OLEH, "_waktu": fs.SERVER_TIMESTAMP, "_lewat": "cli", "_alasan": alasan.strip()}
    b = db.batch()
    ref = db.document(path)
    if aksi == "hapus":
        b.delete(ref)
    else:
        b.set(ref, dict(_bersih(body), **jejak))
    b.set(db.collection("jejak").document(), dict({"aksi": aksi, "path": path}, **jejak))
    b.commit()


def main():
    ap = argparse.ArgumentParser(description="Log Harian Nepal v2 — alat agen")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ringkas")
    sub.add_parser("sidik")
    p = sub.add_parser("baca"); p.add_argument("koleksi", choices=KOLEKSI + ("jejak",)); p.add_argument("--id"); p.add_argument("--sejak")
    p = sub.add_parser("tulis"); p.add_argument("koleksi", choices=("hari", "entri", "config", "pembayaran")); p.add_argument("id")
    p.add_argument("--json"); p.add_argument("--file"); p.add_argument("--alasan", required=True)
    p = sub.add_parser("kurs"); p.add_argument("tanggal"); p.add_argument("--json", required=True); p.add_argument("--alasan", required=True)
    p = sub.add_parser("hapus"); p.add_argument("koleksi", choices=("hari", "entri")); p.add_argument("id"); p.add_argument("--alasan", required=True)
    p = sub.add_parser("cadangkan"); p.add_argument("--ke", required=True)
    p = sub.add_parser("akses-tambah"); p.add_argument("uid"); p.add_argument("--nama", required=True); p.add_argument("--alasan", required=True)
    a = ap.parse_args()

    db, fs = klien()
    if a.cmd in ("ringkas", "sidik"):
        cfg, hari, entri, kurs = bentuk_halaman(muat(db))
        out = aturan.ringkas(cfg, hari, entri, kurs) if a.cmd == "ringkas" else sidik_dari(cfg, hari, entri, kurs)
        print(_json(out)); return
    if a.cmd == "baca":
        if a.id:
            d = db.collection(a.koleksi).document(a.id).get(); print(_json(d.to_dict() if d.exists else None)); return
        docs = {d.id: d.to_dict() for d in db.collection(a.koleksi).stream()}
        if a.sejak:
            docs = {i: v for i, v in docs.items() if (v.get("tanggal") or i) >= a.sejak}
        print(_json(docs)); return
    if a.cmd == "tulis":
        body = json.loads(a.json if a.json else Path(a.file).read_text("utf-8"))
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        if a.koleksi == "entri":
            old = db.collection("entri").document(a.id).get()
            prev = old.to_dict() if old.exists else {}
            body = dict({"lampiran": []}, **_bersih(prev), **body)
            body.setdefault("createdAt", prev.get("createdAt") or now)
            body["updatedAt"] = now
            for f in ("tanggal", "kategori", "jumlah", "mataUang", "perlakuan"):
                if f not in body:
                    sys.exit(f"Kolom wajib entri tidak ada: {f}")
        if a.koleksi == "hari":
            body["tanggal"] = a.id; body["updatedAt"] = now
        path = f"config/{a.id}" if a.koleksi == "config" else f"{a.koleksi}/{a.id}"
        tulis(db, fs, path, body, a.alasan); print("OK", path); return
    if a.cmd == "kurs":
        tulis(db, fs, f"kurs/{a.tanggal}", json.loads(a.json), a.alasan); print("OK kurs", a.tanggal); return
    if a.cmd == "hapus":
        tulis(db, fs, f"{a.koleksi}/{a.id}", {}, a.alasan, aksi="hapus"); print("Dihapus", a.koleksi, a.id); return
    if a.cmd == "akses-tambah":
        tulis(db, fs, f"akses/{a.uid}", {"nama": a.nama}, a.alasan); print("Akses ditambahkan", a.uid); return
    if a.cmd == "cadangkan":
        raw = muat(db)
        stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=45))).strftime("%Y-%m-%d %H%M")
        out = {"dibuat": dt.datetime.now(dt.timezone.utc).isoformat(), "sumber": "Firestore log-harian-nepal (v2)",
               "koleksi": {k: [{"id": i, "data": v} for i, v in sorted(raw[k].items())] for k in KOLEKSI}}
        p = Path(a.ke) / f"Log Harian v2 {stamp}.json"
        p.write_text(_json(out), "utf-8"); print("Cadangan:", p); return


if __name__ == "__main__":
    main()

"""Buku aturan Log Harian Nepal (padanan Python dari js/aturan.js).

Dikunci bersama oleh tes/vektor.json: ubah kedua berkas bersamaan, lalu jalankan
`node tes/tes_aturan.mjs` dan `python3 tes/tes_aturan.py`.
"""
import json
import math

BILL = {"kerja", "remote", "travel"}


def pick(kurs, d, f):
    v = None
    for k in kurs:
        if k["tanggal"] <= d and k.get(f):
            v = k
        elif k["tanggal"] > d:
            break
    if v is None:
        v = next((k for k in kurs if k.get(f)), None)
    return v


def rate_for(kurs, cfg, d):
    cfg = cfg or {}
    n, i, u = pick(kurs, d, "nprPerEur"), pick(kurs, d, "idrPerEur"), pick(kurs, d, "usdPerEur")
    return {
        "npr": n["nprPerEur"] if n else cfg.get("nprPerEur") or 0,
        "idr": i["idrPerEur"] if i else cfg.get("idrPerEur") or 0,
        "usd": u["usdPerEur"] if u else cfg.get("usdPerEur") or 0,
    }


def to_eur(kurs, cfg, a, cur, d):
    """None = tidak ada kurs (mis. SGD); jangan dianggap nol biaya."""
    r = rate_for(kurs, cfg, d)
    if cur == "EUR":
        return a
    key = {"NPR": "npr", "IDR": "idr", "USD": "usd"}.get(cur)
    if key is None or not r[key]:
        return None
    return a / r[key]


def lokasi_malam(hari, cfg, d):
    h = hari.get(d)
    if h and h.get("lokasi"):
        return h["lokasi"]
    return "ktm" if cfg and d >= cfg["tiba"] else "luar"


def jatah_eur(hari, cfg, d):
    if not cfg:
        return 0
    lok = lokasi_malam(hari, cfg, d)
    return cfg["ocKtm"] if lok == "ktm" else cfg["ocNepal"] if lok == "nepal" else 0


def round2(n):
    # sama dengan Math.round(n*100)/100 di JS (pembulatan setengah ke atas)
    return math.floor(n * 100 + 0.5) / 100


def ringkas(cfg, hari, entri, kurs):
    """hari: {tanggal: dict}; entri: {id: dict}; kurs: list terurut naik (tiap item punya 'tanggal')."""
    mentah, eur, tanpa = {}, {}, []
    for eid, e in sorted(entri.items()):
        k = f"{e['perlakuan']}|{e['mataUang']}"
        mentah[k] = round2(mentah.get(k, 0) + float(e.get("jumlah") or 0))
        v = to_eur(kurs, cfg, float(e.get("jumlah") or 0), e["mataUang"], e["tanggal"])
        if v is None:
            tanpa.append(eid)
        else:
            eur[e["perlakuan"]] = eur.get(e["perlakuan"], 0) + v
    eur = {p: round2(v) for p, v in eur.items()}
    hari_set = set(hari) | {e["tanggal"] for e in entri.values()}
    jatah = sum(jatah_eur(hari, cfg, d) for d in hari_set)
    return {
        "jumlahHari": len(hari), "jumlahEntri": len(entri), "jumlahKurs": len(kurs),
        "billable": sum(1 for h in hari.values() if h.get("jenis") in BILL),
        "jatahEUR": round2(jatah), "mentah": mentah, "eur": eur, "tanpaKurs": sorted(tanpa),
    }


def _num(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e21:
            return str(int(v))
        return repr(v)
    raise TypeError(v)


def kanonik(v):
    """Sama dengan kanonik() di js/aturan.js: kunci terurut, kolom berawalan '_' diabaikan."""
    if isinstance(v, list):
        return "[" + ",".join(kanonik(x) for x in v) + "]"
    if isinstance(v, dict):
        ks = sorted(k for k in v if not k.startswith("_"))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + kanonik(v[k]) for k in ks) + "}"
    if v is None:
        return "null"
    if isinstance(v, (bool, int, float)):
        return _num(v)
    return json.dumps(v, ensure_ascii=False)

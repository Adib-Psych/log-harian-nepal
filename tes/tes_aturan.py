"""python3 tes/tes_aturan.py — memastikan alat/aturan.py sama persis dengan js/aturan.js."""
import json, subprocess, sys
from pathlib import Path
T = Path(__file__).parent
sys.path.insert(0, str(T.parent / "alat"))
import aturan  # noqa: E402
subprocess.run(["node", str(T / "tes_aturan.mjs")], check=True, stdout=subprocess.DEVNULL)
v = json.loads((T / "vektor.json").read_text("utf-8"))
js = json.loads((T / "keluaran_js.json").read_text("utf-8"))
py = {
    "ringkas": aturan.ringkas(v["cfg"], v["hari"], v["entri"], v["kurs"]),
    "kanonik": [aturan.kanonik(x) for x in v["kanonik_kasus"]],
    "sisa": aturan.proyeksi_sisa(v["hari"], v["kontrak"], v["cfg"]),
    "rate": [[r["npr"], r["idr"], r["usd"]] for r in (aturan.rate_for(v["kurs"], v["cfg"], d) for d in ["2026-09-01", "2026-09-15", "2026-10-02", "2026-10-04", "2027-01-01"])],
}
py["posisi"] = aturan.posisi_pembayaran(v["pembayaran"], v["kontrak"], py["sisa"])
gagal = [k for k in py if aturan.kanonik(py[k]) != aturan.kanonik(js[k])]
if gagal:
    for k in gagal: print("BEDA", k, "\n py:", py[k], "\n js:", js[k])
    sys.exit(1)
print("OK python == js")

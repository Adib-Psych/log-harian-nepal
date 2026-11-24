// Lapisan data v2: Firestore + Firebase Auth, dengan antarmuka yang sama seperti v1
// (db.doc(...).get/set/delete, db.collection(...).onSnapshot, assets.upload/delete).
// Setiap tulisan membawa jejak: _oleh (email akun), _waktu (waktu server), _lewat, _alasan,
// dan satu dokumen di koleksi `jejak` (hanya bisa ditambah, tidak bisa diubah/dihapus).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, onSnapshot, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const fs = getFirestore(app);

export const masuk = () => signInWithPopup(auth, new GoogleAuthProvider());
export const keluar = () => signOut(auth);
export const pantauAkun = cb => onAuthStateChanged(auth, cb);

let lewat = "halaman";          // diganti "agen-chrome" oleh window.LH
let alasan = "";                // alasan untuk tulisan berikutnya (agen wajib mengisi)
export function konteksTulis(l, a) { lewat = l; alasan = a || ""; }

function jejakFields() {
  const u = auth.currentUser;
  return { _oleh: u ? u.email : null, _waktu: serverTimestamp(), _lewat: lewat, _alasan: alasan || null };
}
function jejakDoc(b, aksi, path) {
  const ref = doc(collection(fs, "jejak"));
  b.set(ref, Object.assign({ aksi, path }, jejakFields()));
}

function snapDoc(s) { return { id: s.id, exists: s.exists(), data: () => s.data() }; }

export const db = {
  doc(path) {
    const ref = doc(fs, path);
    return {
      async get() { return snapDoc(await getDoc(ref)); },
      async set(body) {
        const b = writeBatch(fs);
        b.set(ref, Object.assign({}, body, jejakFields()));
        jejakDoc(b, "tulis", path);
        await b.commit();
      },
      async delete() {
        const b = writeBatch(fs);
        b.delete(ref);
        jejakDoc(b, "hapus", path);
        await b.commit();
      },
      onSnapshot(cb, err) { return onSnapshot(ref, s => cb(snapDoc(s)), err); },
    };
  },
  collection(name) {
    const ref = collection(fs, name);
    return {
      onSnapshot(cb, err) { return onSnapshot(ref, q => cb({ docs: q.docs.map(snapDoc) }), err); },
      async get() { const q = await getDocs(ref); return { docs: q.docs.map(snapDoc) }; },
    };
  },
};

// ---------- nota: disimpan di Firestore, dipecah per ±700 KB ----------
const BAGIAN = 700000; // karakter base64 per dokumen (batas dokumen Firestore 1 MiB)
const blobUrl = new Map();

function b64(buf) {
  let s = ""; const a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}
// Foto besar diperkecil (sisi terpanjang 1600 px, JPEG 0,8). PDF disimpan apa adanya.
async function kecilkan(blob, type) {
  if (!type.startsWith("image/") || blob.size <= 600000) return { blob, type };
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
  return { blob: out || blob, type: out ? "image/jpeg" : type };
}

export const assets = {
  async upload(blob, opt) {
    const { blob: kb, type } = await kecilkan(blob, (opt && opt.type) || blob.type || "application/octet-stream");
    const buf = await kb.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) { const e = new Error("terlalu besar"); e.code = "quota_exceeded"; throw e; }
    const s = b64(buf), n = Math.ceil(s.length / BAGIAN) || 1;
    const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const b = writeBatch(fs);
    for (let i = 0; i < n; i++) b.set(doc(fs, `nota/${id}/bagian/${i}`), Object.assign({ d: s.slice(i * BAGIAN, (i + 1) * BAGIAN) }, jejakFields()));
    b.set(doc(fs, `nota/${id}`), Object.assign({ tipe: type, ukuran: buf.byteLength, bagian: n, sha256: await sha256(buf) }, jejakFields()));
    jejakDoc(b, "unggah", `nota/${id}`);
    await b.commit();
    return { id, contentType: type, sizeBytes: buf.byteLength };
  },
  async delete(id) {
    const m = await getDoc(doc(fs, `nota/${id}`));
    if (!m.exists()) return;
    const b = writeBatch(fs);
    for (let i = 0; i < (m.data().bagian || 1); i++) b.delete(doc(fs, `nota/${id}/bagian/${i}`));
    b.delete(doc(fs, `nota/${id}`));
    jejakDoc(b, "hapus", `nota/${id}`);
    await b.commit();
    blobUrl.delete(id);
  },
};

// URL lokal (blob:) untuk menampilkan nota; null bila nota tidak ada di v2 (nota lama di arsip v1).
export async function notaURL(id) {
  if (blobUrl.has(id)) return blobUrl.get(id);
  const m = await getDoc(doc(fs, `nota/${id}`));
  if (!m.exists()) { blobUrl.set(id, null); return null; }
  const { tipe, bagian } = m.data(); let s = "";
  for (let i = 0; i < (bagian || 1); i++) { const p = await getDoc(doc(fs, `nota/${id}/bagian/${i}`)); s += p.exists() ? p.data().d : ""; }
  const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const u = URL.createObjectURL(new Blob([a], { type: tipe }));
  blobUrl.set(id, u); return u;
}

// Impor bundel migrasi (sekali pakai): semua dokumen ditulis dengan jejak "migrasi v1 ke v2".
export async function imporBundel(bundel, onProgres) {
  // Bentuk bundel: {koleksi: {config:[{id,data}], hari:[...], entri:[...], kurs:[...]}}
  const items = [];
  for (const k of ["config", "hari", "entri", "kurs"]) {
    for (const { id, data } of (bundel.koleksi && bundel.koleksi[k]) || []) items.push([`${k}/${id}`, data]);
  }
  konteksTulis("impor", "migrasi Log Harian v1 (artifact claude.ai) ke v2");
  for (let i = 0; i < items.length; i += 200) {
    const b = writeBatch(fs);
    items.slice(i, i + 200).forEach(([p, body]) => b.set(doc(fs, p), Object.assign({}, body, jejakFields())));
    jejakDoc(b, "impor", `batch ${i / 200 + 1}`);
    await b.commit();
    onProgres && onProgres(Math.min(items.length, i + 200), items.length);
  }
  konteksTulis("halaman", "");
  return items.length;
}

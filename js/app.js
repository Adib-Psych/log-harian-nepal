// Log Harian Nepal v2 — logika tampilan diambil dari v1 (artifact claude.ai, versi 1791002175-8ec9);
// yang berubah: lapisan data (store.js), login, nota, jejak perubahan, dan API agen (window.LH).
import * as A from "./aturan.js";
import { db as fdb, assets as fassets, notaURL, masuk, keluar, pantauAkun, konteksTulis, imporBundel, auth } from "./store.js";
import { V1_URL } from "./firebase-config.js";

const $=id=>document.getElementById(id);
const TZ="Asia/Kathmandu";
const HARIL=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BLN=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"], BLNL=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const JENIS={kerja:"Kerja",remote:"Kerja remote",travel:"Travel",libur:"Libur",rr:"R&R"};
const JHINT={kerja:"<b>Dibayar fee €300.</b> Dapat jatah <i>other costs</i> bila bermalam di Nepal. Sabtu/Minggu juga dicatat Kerja bila memang bekerja.",
  remote:"<b>Dibayar fee €300, tanpa jatah <i>other costs</i>.</b> Kerja jarak jauh dari luar Nepal (mis. 8–11 Sep dari Malang). Kuotasi RVO: hari kerja termasuk <i>remote working days</i>; T&C: tidak ada DSA di hari remote.",
  travel:"<b>Dibayar fee €300.</b> Hari perjalanan berangkat atau pulang.",
  libur:"<b>Tidak dibayar fee.</b> Hari tidak bekerja. Jatah <i>other costs</i> tetap berlaku bila bermalam di Nepal."};
const { BILL, CATL, CATP, PER } = A;
const QUICK=[["bf","☕","Breakfast","makan","Breakfast"],["lu","🍛","Lunch","makan","Lunch"],["di","🍽️","Dinner","makan","Dinner"],["ks","🥤","Kopi & snack","makan","Coffee & Snacks"],["ko","🛵","Ke kantor","transport","Ride to Office"],["pu","🏠","Pulang","transport","Ride Home"],["be","🛒","Belanja","belanja",""]];
const MORE=[["tr","Transport lain","transport"],["kerja","Keperluan kerja","kerja"],["akomodasi","Akomodasi","akomodasi"],["tiket","Tiket & bandara","tiket"],["visa","Visa & medis","visa"],["komunikasi","Pulsa & internet","komunikasi"],["lain","Lain-lain","lain"]];
const QKET=new Set(QUICK.map(q=>q[4]).filter(Boolean));
const MONTHS=["2026-09","2026-10","2026-11","2026-12"];

let db=null, assets=null, cfg=null, hari=new Map(), entri=new Map(), kurs=[];
let sel=null, month=null, dayBusy=false, dayDraft=null, dayDirty=false, dayStamp=null;
let form=null;
let loaded={config:false,hari:false,entri:false,kurs:false};
let pembayaran=[], kontrak=null;

const todayISO=()=>new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const P=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(Date.UTC(y,m-1,d));};
const I=d=>d.toISOString().slice(0,10);
const addD=(s,n)=>I(new Date(P(s).getTime()+n*864e5));
const longD=s=>{const d=P(s);return `${HARIL[d.getUTCDay()]}, ${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;};
const fmt=n=>Math.round(n).toLocaleString("id-ID");
const npr=n=>"NPR "+fmt(n);
function num(v){ let s=String(v||"").replace(/\s/g,""); if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,"").replace(",","."); else s=s.replace(",","."); const n=parseFloat(s); return isFinite(n)?n:0; }
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const rateFor=d=>A.rateFor(kurs,cfg,d||todayISO());
const toEUR=(a,cur,d)=>A.toEUR(kurs,cfg,a,cur,d)??0;  // tampilan: mata uang tanpa kurs = 0 (seperti v1); ringkasan agen menandainya terpisah
function toNPR(a,cur,d){ return cur==="NPR"?a:toEUR(a,cur,d)*rateFor(d).npr; }
const toIDR=(a,cur,d)=>cur==="IDR"?a:toEUR(a,cur,d)*rateFor(d).idr;
const eur=n=>"€"+(Math.round(n*100)/100).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
const rp=n=>"Rp "+fmt(n);
const sd=s=>{ if(!s) return "–"; const d=P(s); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]}`; };
const eurOf=e=>toEUR(e.jumlah,e.mataUang,e.tanggal);
const lokOf=d=>A.lokasiMalam(hari,cfg,d);
const jatahE=d=>A.jatahEUR(hari,cfg,d);
const jatah=d=>jatahE(d)*rateFor(d).npr;
function entriesOn(d){ return [...entri.values()].filter(e=>e.tanggal===d).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||"")); }
const ocOn=d=>entriesOn(d).filter(e=>e.perlakuan==="oc").reduce((s,e)=>s+toNPR(e.jumlah,e.mataUang,d),0);
const ocOnE=d=>entriesOn(d).filter(e=>e.perlakuan==="oc").reduce((s,e)=>s+eurOf(e),0);
function recordedDays(){ const s=new Set(hari.keys()); entri.forEach(e=>s.add(e.tanggal)); return [...s]; }

/* ---------- summary ---------- */
function renderSummary(){
  const t=todayISO();
  $("todayLbl").textContent=longD(t);
  const bill=[...hari.values()].filter(h=>BILL.has(h.jenis)).length, plan=cfg?cfg.rencanaHari:80;
  $("ringN").textContent=bill; $("ringOf").textContent=`dari ${plan} hari`;
  const C=314.16; $("ringVal").setAttribute("stroke-dashoffset",String(C*(1-Math.min(1,bill/plan))));
  const days=recordedDays();
  const jt=days.reduce((s,d)=>s+jatah(d),0);
  const oc=[...entri.values()].filter(e=>e.perlakuan==="oc").reduce((s,e)=>s+toNPR(e.jumlah,e.mataUang,e.tanggal),0);
  const jtE=days.reduce((s,d)=>s+jatahE(d),0), ocE=[...entri.values()].filter(e=>e.perlakuan==="oc").reduce((s,e)=>s+eurOf(e),0), surE=jtE-ocE, rT=rateFor(t);
  renderHero(days,jt,oc,jtE,ocE,surE,rT);
  const fee=cfg?bill*cfg.feePerDay:0;
  $("kFee").textContent="€"+fmt(fee);
  const rvo=[...entri.values()].filter(e=>e.perlakuan==="rvo").reduce((s,e)=>s+eurOf(e),0);
  $("kRvo").textContent=cfg?"€"+fmt(rvo):"–";
  const miss=missingDays(); $("kMiss").textContent=miss.length;
  $("sumNote").textContent=bill>plan?`Hari kerja melewati rencana ${plan} hari — yang mengikat adalah plafon total €40.570.`:"";
}
function renderHero(days,jt,oc,jtE,ocE,surE,rT){
  if(!cfg) return;
  const jd=days.filter(d=>jatahE(d)>0), ocDays=new Set([...entri.values()].filter(e=>e.perlakuan==="oc"&&jatahE(e.tanggal)>0).map(e=>e.tanggal));
  const nJt=jd.length, nOc=jd.filter(d=>ocDays.has(d)).length, gap=nJt-nOc, pct=jtE>0?ocE/jtE:0;
  const lv=surE<0?"bad":gap>0&&nJt>0&&nOc/nJt<.8?"warn":"ok";
  const big=$("hSisa"); big.textContent=(surE<0?"−":"")+eur(Math.abs(surE)); big.className="big"+(surE<0?" bad":"");
  $("hRp").innerHTML=`${surE<0?"−":""}Rp ${fmt(Math.abs(surE)*rT.idr)}<small>≈ NPR ${fmt(Math.abs(jt-oc))} · kurs BI ${sd(rT.tI)}</small>`;
  const pill=$("hPill"); pill.className="pill"+(lv==="ok"?"":" "+lv);
  pill.textContent=surE<0?"Lewat jatah":lv==="warn"?`${gap} hari belum dicatat`:"Aman";
  const u=$("hUsed"); u.style.width=Math.min(100,pct*100)+"%"; u.classList.toggle("bad",pct>1);
  $("hBar").setAttribute("aria-label",`Terpakai ${Math.round(pct*100)} persen dari jatah`);
  $("hJt").textContent=eur(jtE); $("hJtN").textContent="NPR "+fmt(jt);
  $("hUs").textContent=eur(ocE); $("hUsN").textContent="NPR "+fmt(oc);
  $("hPct").textContent=Math.round(pct*100)+"%";
  $("cJt").textContent=nJt; $("cOc").textContent=`${nOc} dari ${nJt}`;
  $("hNote").textContent=lv==="warn"?"Hari tanpa catatan belanja membuat sisa terlihat lebih besar dari kenyataan. Jatah dibayar tetap €83/hari di Kathmandu, jadi sisa ini milikmu.":surE<0?"Belanja dari jatah sudah melebihi €83/hari rata-rata. Kelebihannya dari kantong sendiri.":"Jatah dibayar tetap €83/hari di Kathmandu tanpa nota; sisa ini milikmu.";
}
function missingDays(){ if(!cfg) return []; const y=addD(todayISO(),-1), out=[]; for(let d=cfg.mulai; d<=y; d=addD(d,1)){ const h=hari.get(d); if(!h||!h.jenis) out.push(d); } return out; }

/* ---------- calendar ---------- */
function renderCal(){
  const [Y,M]=month.split("-").map(Number), t=todayISO();
  $("calT").innerHTML=`${BLNL[M-1]} <small>${Y}</small>`;
  const mi=MONTHS.indexOf(month); $("prevM").disabled=mi<=0; $("nextM").disabled=mi>=MONTHS.length-1;
  const cal=$("cal"); cal.innerHTML="";
  ["Min","Sen","Sel","Rab","Kam","Jum","Sab"].forEach((h,i)=>{const e=document.createElement("div"); e.className="dow"+(i===0||i===6?" we":""); e.textContent=h.toUpperCase(); e.setAttribute("role","columnheader"); cal.appendChild(e);});
  const first=new Date(Date.UTC(Y,M-1,1)), start=first.getUTCDay(), nd=new Date(Date.UTC(Y,M,0)).getUTCDate();
  for(let i=0;i<start;i++){ const e=document.createElement("div"); e.className="day"; e.style.borderTop="0"; cal.appendChild(e); }
  for(let d=1; d<=nd; d++){
    const s=`${Y}-${String(M).padStart(2,"0")}-${String(d).padStart(2,"0")}`, wd=(start+d-1)%7;
    const inRange=cfg? (s>=cfg.mulai && s<="2026-12-20") : true, future=s>t;
    const b=document.createElement("button"); b.type="button";
    b.className="day"+(wd===0||wd===6?" we":"")+(s===t?" today":"")+(s===sel?" sel":"")+(!inRange?" out":"");
    const h=hari.get(s), hasSp=entriesOn(s).length>0;
    let dots="";
    if(h&&h.jenis) dots+=`<i class="dot ${h.jenis}"></i>`; else if(inRange&&!future&&s!==t) dots+=`<i class="dot miss"></i>`;
    if(hasSp) dots+=`<i class="dot spend"></i>`;
    b.innerHTML=`<span class="n">${d}</span><span class="dots">${dots}</span>`;
    b.setAttribute("aria-label",`${longD(s)}${h&&h.jenis?", "+JENIS[h.jenis]:""}${hasSp?", ada belanja":""}`);
    if(future){ b.disabled=true; } else b.onclick=()=>{ selectDay(s); };
    cal.appendChild(b);
  }
}

/* ---------- day panel ---------- */
function selectDay(s){ if(s!==sel){ dayDirty=false; dayDraft=null; } sel=s; closeSheet(true); renderCal(); renderDay(); $("dayT").scrollIntoView({behavior:"smooth",block:"start"}); }
function renderDay(){
  if(!sel) return;
  $("dayT").textContent=longD(sel);
  const h=hari.get(sel);
  if(!dayDirty||!dayDraft||dayDraft.tanggal!==sel){
    dayDraft={tanggal:sel, jenis:h&&h.jenis||null, lokasi:lokOf(sel), ket:h&&h.ket||""};
    dayStamp=h?(h.updatedAt||null):null; dayDirty=false; $("dayConflict").classList.add("hide");
  }
  paintDay(h);
  const list=entriesOn(sel); renderDayRing(list);
  const E=$("entries"); E.innerHTML="";
  if(!list.length){ E.innerHTML='<p class="note" style="margin:0">Belum ada entri. Ketuk "Tambah entri" untuk mencatat makan, transport, belanja, atau nota lain.</p>'; }
  list.forEach(e=>{
    const b=document.createElement("button"); b.type="button"; b.className="ent";
    const n=(e.lampiran||[]).length;
    const eE=eurOf(e), cv=e.mataUang==="EUR"?rp(toIDR(e.jumlah,"EUR",e.tanggal)):e.mataUang==="IDR"?eur(eE):`${eur(eE)} · ${rp(toIDR(e.jumlah,e.mataUang,e.tanggal))}`;
    b.innerHTML=`<span class="k">${esc(CATL[e.kategori]||e.kategori)}</span><span class="a">${esc(e.mataUang)} ${fmt(e.jumlah)}</span><span></span><span class="c">≈ ${cv}</span>
      <span class="d"><span class="tag ${esc(e.perlakuan)}">${esc(PER[e.perlakuan]||e.perlakuan)}</span>${e.ket?`<span>${esc(e.ket)}</span>`:""}${n?`<span class="clip">${n} nota</span>`:""}</span>`;
    b.onclick=()=>openSheet(e.id); E.appendChild(b);
  });
}
function renderDayRing(list){
  const d=sel, r=rateFor(d), jE=jatahE(d), el=$("daySum");
  $("kLine").textContent=r.resmi?`Kurs ${sd(d)}: 1 € = NPR ${r.npr.toLocaleString("id-ID",{maximumFractionDigits:2})} (NRB ${sd(r.tN)}) · 1 € = Rp ${fmt(r.idr)} (BI ${sd(r.tI)})`:"Kurs resmi belum tersedia — memakai kurs kerja di pengaturan.";
  if(!jE){ const tE=list.reduce((s,e)=>s+eurOf(e),0);
    el.className="daysum"; el.innerHTML=`<span>Tanpa jatah <i>other costs</i> (di luar Nepal).</span><span>Tercatat <b class="num">${eur(tE)}</b> ≈ <b class="num">${rp(tE*r.idr)}</b></span>`; return; }
  const uE=ocOnE(d), sE=jE-uE, pct=uE/jE, C=2*Math.PI*46;
  const lv=pct>1?"over":pct>=.8?"warn":"ok";
  const msg=pct>1?`Lewat jatah ${eur(-sE)} (≈ ${rp(-sE*r.idr)}) — selisihnya dari kantong sendiri.`:pct>=.8?`Hampir habis — sisa ${eur(sE)} hari ini.`:uE>0?`Masih aman — sisa ${eur(sE)} ≈ NPR ${fmt(sE*r.npr)} hari ini.`:`Belum ada belanja dari jatah hari ini.`;
  const row=(lbl,e,cls)=>`<div class="r"><span>${lbl}</span><b class="${cls||""}">${cls==="neg"?"−":""}NPR ${fmt(Math.abs(e)*r.npr)}</b><small>${cls==="neg"?"−":""}${eur(Math.abs(e))} · ${cls==="neg"?"−":""}${rp(Math.abs(e)*r.idr)}</small></div>`;
  el.className="dring";
  el.innerHTML=`<div class="ring sm" role="img" aria-label="Jatah other costs terpakai ${Math.round(pct*100)} persen">
      <svg viewBox="0 0 112 112"><circle class="trk" cx="56" cy="56" r="46"/><circle class="val ${lv==="ok"?"":lv}" cx="56" cy="56" r="46" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C*(1-Math.min(1,pct))).toFixed(2)}"/></svg>
      <div class="lbl"><b class="num">${Math.round(pct*100)}%</b><span>dari ${eur(jE).replace(",00","")}</span></div></div>
    <div class="dtab">${row("Jatah",jE)}${row("Terpakai",uE)}${row(sE<0?"Lewat":"Sisa",sE,sE<0?"neg":"pos")}</div>
    <div class="dstat ${lv}">${msg}</div>${weekHtml(d,r)}`;
}
function weekHtml(d,r){
  let j=0,u=0,n=0; for(let i=0;i<7;i++){ const x=addD(d,-i); if(cfg&&x<cfg.mulai) break; const je=jatahE(x); if(je){ j+=je; u+=ocOnE(x); n++; } }
  if(!j) return "";
  const s=j-u, p=u/j;
  return `<div class="dweek"><div class="wl"><span>7 hari terakhir (${n} hari berjatah)</span><b class="${s<0?"neg":"pos"}">${s<0?"Lewat ":"Sisa "}${eur(Math.abs(s))}</b></div>
    <div class="wbar"><i class="${p>1?"over":""}" style="width:${Math.min(100,p*100)}%"></i></div>
    <div class="wl"><span>Terpakai ${eur(u)} dari ${eur(j)} · ${Math.round(p*100)}%</span><span>≈ ${s<0?"−":""}Rp ${fmt(Math.abs(s)*r.idr)}</span></div></div>`;
}
function paintDay(h){
  const d=dayDraft;
  document.querySelectorAll("#segJenis button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===d.jenis)));
  $("fLok").value=d.lokasi; if(document.activeElement!==$("fDayKet")) $("fDayKet").value=d.ket;
  $("jHint").innerHTML=d.jenis?JHINT[d.jenis]||"":"Pilih jenis hari: <b>Kerja</b>, <b>Kerja remote</b> dan <b>Travel</b> dibayar fee; <b>Libur</b> tidak.";
  const badge=$("dayBadge");
  if(dayDirty){ badge.textContent="Belum disimpan"; badge.className="badge warn"; $("daySave").disabled=!d.jenis; $("daySave").textContent="Simpan hari"; }
  else if(h&&h.jenis){ const t=h.updatedAt?new Intl.DateTimeFormat("id-ID",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}).format(new Date(h.updatedAt)):""; badge.textContent=`✓ Tersimpan · ${JENIS[h.jenis]||h.jenis}${t?" · "+t:""}`; badge.className="badge"; $("daySave").disabled=true; $("daySave").textContent="Tersimpan"; }
  else { badge.className="badge hide"; $("daySave").disabled=!d.jenis; $("daySave").textContent="Simpan hari"; }
  $("daySaved").textContent="";
}
function editDay(patch){ Object.assign(dayDraft,patch); dayDirty=true; paintDay(hari.get(sel)); }
async function saveDay(force){
  if(!db||!sel||dayBusy||!dayDraft||!dayDraft.jenis) return;
  const body={tanggal:sel, jenis:dayDraft.jenis, lokasi:dayDraft.lokasi, ket:(dayDraft.ket||"").trim().slice(0,200), updatedAt:new Date().toISOString()};
  dayBusy=true; $("daySave").disabled=true; $("daySave").textContent="Menyimpan…";
  try{
    if(!force){ const cur=await db.doc("hari/"+sel).get(); const cs=cur.exists?(cur.data().updatedAt||null):null;
      if(cs!==dayStamp){ const v=cur.exists?cur.data():null;
        $("dayConflictMsg").innerHTML=v?`Tanggal ini baru disimpan dari perangkat lain${v._oleh?" ("+esc(v._oleh)+")":""} sebagai <b>${JENIS[v.jenis]||esc(v.jenis)}</b>${v.ket?" · "+esc(v.ket):""}.`:"Catatan tanggal ini sudah dihapus dari perangkat lain.";
        $("dayConflict").classList.remove("hide"); dayBusy=false; paintDay(hari.get(sel)); return; } }
    await db.doc("hari/"+sel).set(body); dayStamp=body.updatedAt; dayDirty=false; $("dayConflict").classList.add("hide");
    hari.set(sel,Object.assign({},body)); renderAll();
  }catch(e){ $("dayBadge").textContent=e&&e.code==="permission-denied"?"Akun ini tidak punya izin menulis":"Gagal menyimpan — coba lagi"; $("dayBadge").className="badge warn"; $("daySave").disabled=false; $("daySave").textContent="Simpan hari"; }
  finally{ dayBusy=false; }
}

/* ---------- entry sheet ---------- */
function pickChip(cat,ket,id){ status(""); form.cat=cat; form.pick=id; $("ePer").value=CATP[cat];
  const k=$("eKet"), cur=k.value.trim(); if(!cur||QKET.has(cur)) k.value=ket||"";
  renderCats(); renderConv(); renderSugg(); setTimeout(()=>$("eAmt").focus({preventScroll:true}),30); }
function renderCats(){
  const q=$("quick"); q.innerHTML="";
  QUICK.forEach(([id,ic,l,cat,ket])=>{ const b=document.createElement("button"); b.type="button"; b.id="q-"+id;
    b.innerHTML=`<span class="ic" aria-hidden="true">${ic}</span><span>${l}</span>`; b.setAttribute("aria-pressed",String(!!form&&form.pick===id));
    b.onclick=()=>pickChip(cat,ket,id); q.appendChild(b); });
  const c=$("cats"); c.innerHTML="";
  MORE.forEach(([id,l,cat])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=l; b.id="cat-"+id;
    b.setAttribute("aria-pressed",String(!!form&&form.pick===id)); b.onclick=()=>pickChip(cat,"",id); c.appendChild(b); });
  $("catNow").innerHTML=form&&form.cat?`Kategori: <b>${esc(CATL[form.cat]||form.cat)}</b>`:"Belum dipilih — ketuk salah satu di atas";
}
function setMore(open){ $("cats").classList.toggle("hide",!open); $("moreBtn").setAttribute("aria-expanded",String(open)); $("moreBtn").textContent=open?"Lainnya ▴":"Lainnya ▾"; }
function guessPick(e){ if(!e) return null; const k=(e.ket||"").trim();
  const q=QUICK.find(x=>x[3]===e.kategori&&x[4]&&x[4].toLowerCase()===k.toLowerCase()); if(q) return q[0];
  if(e.kategori==="makan"){ if(/^(breakfast|sarapan)/i.test(k)) return "bf"; if(/^(dinner|makan (malam|sore))/i.test(k)) return "di"; if(/^(lunch|makan siang)/i.test(k)) return "lu"; if(/(coffee|kopi|snack|pastry)/i.test(k)) return "ks"; return null; }
  if(e.kategori==="transport"){ if(/(to office|otw office|ke kantor|→\s*UN House)/i.test(k)) return "ko"; if(/(home|pulang|→\s*Haven)/i.test(k)) return "pu"; return "tr"; }
  if(e.kategori==="belanja") return "be";
  const m=MORE.find(x=>x[2]===e.kategori&&x[0]!=="tr"); if(m) return m[0];
  return null; }
const NOTPLACE=/(bayar|kartu|esewa|aplikasi|dibayar|kupon|cash|tunai|mastercard|visa\b|•)/i;
function splitKet(k){ k=String(k||""); const i=k.indexOf(" · "); return i<0?[k,""]:[k.slice(0,i),k.slice(i+3)]; }
function placeOf(k){ const segs=String(k||"").split(" · ").slice(1); const p=segs.find(x=>x.trim()&&!NOTPLACE.test(x)); if(!p) return ""; return p.replace(/\s*\([^)]*\)?/g," ").replace(/\s+via\s.*$/i,"").replace(/,\s*order\b.*$/i,"").replace(/\s{2,}/g," ").trim().slice(0,48); }
function recentPlaces(cat){ const seen=new Set(), out=[];
  [...entri.values()].filter(e=>!cat||e.kategori===cat).sort((a,b)=>(b.tanggal+(b.createdAt||"")).localeCompare(a.tanggal+(a.createdAt||"")))
    .forEach(e=>{ const p=placeOf(e.ket); const key=p.toLowerCase(); if(p&&!seen.has(key)){ seen.add(key); out.push(p); } });
  return out.slice(0,6); }
function renderSugg(){ const S=$("sugg"); S.innerHTML=""; if(!form) return;
  const cur=$("eLoc").value.trim().toLowerCase();
  $("lLoc").textContent=form.cat==="transport"?"Rute / tempat":"Tempat";
  $("eLoc").placeholder=form.cat==="transport"?"mis. Haven → UN House":"mis. Hokkaido House, Sanepa";
  recentPlaces(form.cat).forEach(p=>{ const b=document.createElement("button"); b.type="button"; b.textContent=p; b.title=p;
    b.setAttribute("aria-pressed",String(cur===p.toLowerCase()));
    b.onclick=()=>{ $("eLoc").value=cur===p.toLowerCase()?"":p; renderSugg(); }; S.appendChild(b); }); }

// Nota: gambar diambil dari Firestore; nota lama (September) tetap di artifact v1.
function hydrateNota(root){
  root.querySelectorAll("[data-nota]").forEach(async el=>{
    const id=el.dataset.nota, img=el.dataset.img==="1";
    const u=await notaURL(id).catch(()=>null);
    if(el.tagName==="A"){ el.href=u||V1_URL; if(!u){ el.querySelector(".th").textContent="Arsip v1"; el.title="Nota lama tersimpan di Log Harian v1"; } else if(img){ el.querySelector(".th").innerHTML=`<img src="${u}" alt="" loading="lazy">`; } }
    else { if(u&&img) el.innerHTML=`<img src="${u}" alt="Nota">`; else if(!u) el.textContent="Arsip v1"; }
  });
}
function renderAtts(){
  const A2=$("atts"); A2.innerHTML="";
  form.atts.forEach((a,i)=>{ const d=document.createElement("div"); d.className="att";
    const isImg=(a.tipe||"").startsWith("image/");
    const box=document.createElement("div"); box.style.cssText="width:100%;height:100%;display:grid;place-content:center";
    box.dataset.nota=a.id; box.dataset.img=isImg?"1":"0"; box.innerHTML=isImg?"…":`PDF<br>${esc((a.nama||"").slice(0,14))}`;
    d.appendChild(box);
    const x=document.createElement("button"); x.type="button"; x.className="x"; x.textContent="×"; x.setAttribute("aria-label","Lepas lampiran"); x.onclick=()=>{ form.removed.push(a); form.atts.splice(i,1); renderAtts(); };
    d.appendChild(x); A2.appendChild(d); });
  hydrateNota(A2);
}
function openSheet(id){
  const e=id?entri.get(id):null;
  form={id:id||null, stamp:e?e.updatedAt:null, cat:e?e.kategori:null, pick:guessPick(e), atts:e?[...(e.lampiran||[])]:[], newUploads:[], removed:[]};
  $("sheetT").textContent=e?"Ubah entri":"Entri baru";
  $("eAmt").value=e?String(e.jumlah).replace(".",","):""; $("eCur").value=e?e.mataUang:"NPR"; $("ePer").value=e?e.perlakuan:"oc"; { const [kb,kl]=splitKet(e?e.ket:""); $("eKet").value=kb; $("eLoc").value=kl; }
  $("eDel").classList.toggle("hide",!e); $("conflict").classList.add("hide"); $("delConfirm").classList.add("hide"); status("");
  setMore(!!(form.pick&&MORE.some(m=>m[0]===form.pick))); renderCats(); renderSugg(); renderAtts(); renderConv(); $("sheet").classList.remove("hide"); $("addBtn").classList.add("hide");
  if(e) setTimeout(()=>$("eAmt").focus({preventScroll:true}),50);
  $("sheet").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function closeSheet(silent){
  if(form&&form.newUploads.length&&assets){ for(const a of form.newUploads){ try{ await assets.delete(a.id); }catch(e){} } }
  form=null; $("sheet").classList.add("hide"); $("addBtn").classList.toggle("hide",!db); if(!silent) status("");
}
function renderConv(){ const a=num($("eAmt").value), cur=$("eCur").value; if(!a||!sel){ $("eConv").textContent=""; return; }
  const E=toEUR(a,cur,sel), r=rateFor(sel), parts=[];
  if(cur!=="NPR") parts.push("NPR "+fmt(E*r.npr)); if(cur!=="EUR") parts.push(eur(E)); if(cur!=="IDR") parts.push(rp(E*r.idr));
  let x=`≈ ${parts.join(" · ")}`; const jE=jatahE(sel); if(jE&&$("ePer").value==="oc") x+=` · ${Math.round(E/jE*100)}% jatah harian`;
  $("eConv").textContent=x; }
function status(m,c){ const s=$("eStatus"); s.textContent=m||""; s.className="status"+(c?" "+c:""); }
async function saveEntry(force){
  if(!db||!form) return;
  const amt=num($("eAmt").value);
  if(!form.cat){ status("Pilih dulu jenisnya (Breakfast, Lunch, Ke kantor, …).","err"); return; }
  if(amt<=0){ status("Isi jumlahnya dulu.","err"); return; }
  const id=form.id||("e"+Date.now().toString(36)+Math.random().toString(36).slice(2,7));
  const now=new Date().toISOString();
  const body={tanggal:sel,kategori:form.cat,jumlah:amt,mataUang:$("eCur").value,perlakuan:$("ePer").value,ket:[$("eKet").value.trim(),$("eLoc").value.trim()].filter(Boolean).join(" · ").slice(0,200),lampiran:form.atts.map(a=>({id:a.id,nama:a.nama||"",tipe:a.tipe||"",ukuran:a.ukuran||0})),createdAt:form.id&&entri.get(form.id)?entri.get(form.id).createdAt:now,updatedAt:now};
  $("eSave").disabled=true; status("Menyimpan…");
  try{
    if(form.id&&!force){
      const cur=await db.doc("entri/"+form.id).get(); const cs=cur.exists?cur.data().updatedAt:null;
      if(cs!==form.stamp){ const v=cur.exists?cur.data():null;
        $("conflictMsg").innerHTML=v?`Entri ini baru diubah dari perangkat lain${v._oleh?" ("+esc(v._oleh)+")":""}: ${esc(CATL[v.kategori]||v.kategori)} ${esc(v.mataUang)} ${fmt(v.jumlah)}${v.ket?" · "+esc(v.ket):""}.`:"Entri ini sudah dihapus dari perangkat lain.";
        $("conflict").classList.remove("hide"); status("Belum disimpan — pilih versi yang dipakai.","err"); return; }
    }
    await db.doc("entri/"+id).set(body);
    if(assets){ for(const a of form.removed){ if(!body.lampiran.some(x=>x.id===a.id)){ try{ await assets.delete(a.id); }catch(e){} } } }
    form.newUploads=[]; status(`Tersimpan: ${CATL[body.kategori]} ${body.mataUang} ${fmt(body.jumlah)}.`,"ok");
    await closeSheet(true);
    const hh=hari.get(sel); $("daySaved").textContent=`tersimpan: ${CATL[body.kategori]} ${body.mataUang} ${fmt(body.jumlah)}`+(hh&&hh.jenis?"":" · jangan lupa pilih jenis hari");
  }catch(e){ status(e&&e.code==="permission-denied"?"Akun ini tidak punya izin menulis.":"Gagal menyimpan. Coba lagi sebentar.","err"); }
  finally{ $("eSave").disabled=false; }
}
async function delEntry(){
  if(!db||!form||!form.id) return;
  const e=entri.get(form.id);
  try{ await db.doc("entri/"+form.id).delete();
    if(assets&&e){ for(const a of (e.lampiran||[])){ try{ await assets.delete(a.id); }catch(x){} } }
    await closeSheet(true); $("daySaved").textContent="entri dihapus"; }
  catch(x){ status("Gagal menghapus. Coba lagi.","err"); }
}

/* ---------- uploads + scanner ---------- */
async function uploadBlob(blob,name,type){
  if(!assets){ status("Unggah nota tidak tersedia.","err"); return; }
  status("Mengunggah nota…");
  try{ const r=await assets.upload(blob,{type}); const a={id:r.id,nama:name,tipe:r.contentType,ukuran:r.sizeBytes}; form.atts.push(a); form.newUploads.push(a); renderAtts(); status("Nota terlampir. Tekan Simpan untuk menyimpan entri.","ok"); }
  catch(e){ status(e&&e.code==="quota_exceeded"?"File terlalu besar (maks. 8 MB).":"Gagal mengunggah. Coba lagi.","err"); }
}
$("inFile").addEventListener("change",async ev=>{ const fs=[...ev.target.files]; ev.target.value=""; for(const f of fs){ if(f.type==="application/pdf") await uploadBlob(f,f.name,"application/pdf"); else if(f.type.startsWith("image/")) await openScanner(f); else status("Hanya foto atau PDF.","err"); } });
$("inScan").addEventListener("change",async ev=>{ const f=ev.target.files[0]; ev.target.value=""; if(f) await openScanner(f); });

let sc=null;
function loadImg(file){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const im=new Image(); im.onload=()=>{res(im);URL.revokeObjectURL(u);}; im.onerror=rej; im.src=u; }); }
async function openScanner(file){
  let im; try{ im=await loadImg(file); }catch(e){ status("Foto tidak bisa dibuka. Coba format JPG/PNG.","err"); return; }
  const MAX=2000, k=Math.min(1,MAX/Math.max(im.naturalWidth,im.naturalHeight));
  const c=document.createElement("canvas"); c.width=Math.round(im.naturalWidth*k); c.height=Math.round(im.naturalHeight*k);
  c.getContext("2d").drawImage(im,0,0,c.width,c.height);
  sc={src:c,mode:true,name:(file.name||"nota").replace(/\.[^.]+$/,"")+".jpg",file};
  resetPts(); $("scMode").setAttribute("aria-pressed","true"); $("scan").classList.remove("hide"); drawStage();
}
function resetPts(){ const w=sc.src.width,h=sc.src.height,m=.05; sc.pts=[{x:w*m,y:h*m},{x:w*(1-m),y:h*m},{x:w*(1-m),y:h*(1-m)},{x:w*m,y:h*(1-m)}]; }
function drawStage(){ const cv=$("scCv"); cv.width=sc.src.width; cv.height=sc.src.height; cv.getContext("2d").drawImage(sc.src,0,0); requestAnimationFrame(placeHandles); }
function placeHandles(){
  const cv=$("scCv"), st=$("stage"), r=cv.getBoundingClientRect(), s=r.width/sc.src.width;
  st.querySelectorAll(".handle").forEach(h=>h.remove());
  const q=$("scQ"); q.setAttribute("viewBox",`0 0 ${r.width} ${r.height}`);
  $("scPoly").setAttribute("points",sc.pts.map(p=>`${p.x*s},${p.y*s}`).join(" "));
  sc.pts.forEach((p,i)=>{ const h=document.createElement("div"); h.className="handle"; h.style.left=(p.x*s)+"px"; h.style.top=(p.y*s)+"px"; h.setAttribute("aria-label","Sudut "+(i+1));
    h.addEventListener("pointerdown",ev=>{ ev.preventDefault(); h.setPointerCapture(ev.pointerId);
      const mv=e2=>{ const rr=cv.getBoundingClientRect(), ss=rr.width/sc.src.width; p.x=Math.max(0,Math.min(sc.src.width,(e2.clientX-rr.left)/ss)); p.y=Math.max(0,Math.min(sc.src.height,(e2.clientY-rr.top)/ss)); h.style.left=(p.x*ss)+"px"; h.style.top=(p.y*ss)+"px"; $("scPoly").setAttribute("points",sc.pts.map(q=>`${q.x*ss},${q.y*ss}`).join(" ")); };
      const up=()=>{ h.removeEventListener("pointermove",mv); h.removeEventListener("pointerup",up); h.removeEventListener("pointercancel",up); };
      h.addEventListener("pointermove",mv); h.addEventListener("pointerup",up); h.addEventListener("pointercancel",up); });
    st.appendChild(h); });
}
let rzT=null; window.addEventListener("resize",()=>{ if(sc&&!$("scan").classList.contains("hide")) placeHandles(); clearTimeout(rzT); rzT=setTimeout(()=>{ if(month&&db) renderChart(); },200); });
$("scRot").onclick=()=>{ const s=sc.src, c=document.createElement("canvas"); c.width=s.height; c.height=s.width; const g=c.getContext("2d"); g.translate(c.width,0); g.rotate(Math.PI/2); g.drawImage(s,0,0); sc.src=c; resetPts(); drawStage(); };
$("scMode").onclick=()=>{ sc.mode=!sc.mode; $("scMode").setAttribute("aria-pressed",String(sc.mode)); };
$("scCancel").onclick=()=>{ $("scan").classList.add("hide"); sc=null; };
$("scRaw").onclick=async()=>{ const f=sc.file; $("scan").classList.add("hide"); const blob=await new Promise(r=>sc.src.toBlob(r,"image/jpeg",.85)); sc=null; await uploadBlob(blob||f,(f.name||"nota.jpg"),"image/jpeg"); };
$("scOk").onclick=async()=>{ $("scOk").disabled=true; $("scanHint").textContent="Memproses…"; await new Promise(r=>setTimeout(r,30));
  try{ const out=warp(sc.src,sc.pts); if(sc.mode) enhance(out); const blob=await new Promise(r=>out.toBlob(r,"image/jpeg",.82)); const name=sc.name; $("scan").classList.add("hide"); sc=null; await uploadBlob(blob,name,"image/jpeg"); }
  catch(e){ status("Scan gagal diproses. Coba 'Tanpa scan'.","err"); $("scan").classList.add("hide"); sc=null; }
  finally{ $("scOk").disabled=false; $("scanHint").textContent="Geser keempat titik ke sudut nota."; } };

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function warp(src,pts){
  const [p0,p1,p2,p3]=pts; let W=Math.max(dist(p0,p1),dist(p3,p2)), H=Math.max(dist(p0,p3),dist(p1,p2));
  const k=Math.min(1,1800/Math.max(W,H)); W=Math.max(10,Math.round(W*k)); H=Math.max(10,Math.round(H*k));
  const x0=p0.x,y0=p0.y,x1=p1.x,y1=p1.y,x2=p2.x,y2=p2.y,x3=p3.x,y3=p3.y;
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
  let a,b,c,d,e,f,g,h;
  if(Math.abs(dx3)<1e-9&&Math.abs(dy3)<1e-9){ a=x1-x0;b=x2-x1;c=x0;d=y1-y0;e=y2-y1;f=y0;g=0;h=0; }
  else{ const det=dx1*dy2-dx2*dy1; g=(dx3*dy2-dx2*dy3)/det; h=(dx1*dy3-dx3*dy1)/det; a=x1-x0+g*x1; b=x3-x0+h*x3; c=x0; d=y1-y0+g*y1; e=y3-y0+h*y3; f=y0; }
  const sw=src.width, sh=src.height, sdd=src.getContext("2d").getImageData(0,0,sw,sh).data;
  const out=document.createElement("canvas"); out.width=W; out.height=H; const og=out.getContext("2d"); const od=og.createImageData(W,H), o=od.data;
  for(let j=0;j<H;j++){ const t=(j+.5)/H; for(let i=0;i<W;i++){ const s=(i+.5)/W, den=g*s+h*t+1; let u=(a*s+b*t+c)/den, v=(d*s+e*t+f)/den;
      if(u<0)u=0; if(v<0)v=0; if(u>sw-1.001)u=sw-1.001; if(v>sh-1.001)v=sh-1.001;
      const ux=u|0, vy=v|0, fx=u-ux, fy=v-vy, i00=(vy*sw+ux)*4, i10=i00+4, i01=i00+sw*4, i11=i01+4, oi=(j*W+i)*4;
      for(let ch=0;ch<3;ch++){ o[oi+ch]=(sdd[i00+ch]*(1-fx)+sdd[i10+ch]*fx)*(1-fy)+(sdd[i01+ch]*(1-fx)+sdd[i11+ch]*fx)*fy; } o[oi+3]=255; } }
  og.putImageData(od,0,0); return out;
}
function enhance(cv){
  const W=cv.width,H=cv.height,g=cv.getContext("2d"), id=g.getImageData(0,0,W,H), p=id.data;
  const sm=document.createElement("canvas"), sW=Math.max(8,Math.round(W/24)), sH=Math.max(8,Math.round(H/24)); sm.width=sW; sm.height=sH;
  const sg=sm.getContext("2d"); sg.imageSmoothingEnabled=true; sg.filter="blur(2px)"; sg.drawImage(cv,0,0,sW,sH);
  const bg=document.createElement("canvas"); bg.width=W; bg.height=H; const bgg=bg.getContext("2d"); bgg.imageSmoothingEnabled=true; bgg.drawImage(sm,0,0,W,H);
  const b=bgg.getImageData(0,0,W,H).data;
  for(let i=0;i<p.length;i+=4){ const y=.299*p[i]+.587*p[i+1]+.114*p[i+2], by=.299*b[i]+.587*b[i+1]+.114*b[i+2];
    let v=y/Math.max(by,1)*255; v=(v-95)*255/(240-95); v=v<0?0:v>255?255:v; p[i]=p[i+1]=p[i+2]=v; }
  g.putImageData(id,0,0);
}

/* ---------- chart ---------- */
function renderChart(){
  const [Y,M]=month.split("-").map(Number), t=todayISO(), nd=new Date(Date.UTC(Y,M,0)).getUTCDate();
  const ds=[]; for(let d=1;d<=nd;d++) ds.push(`${Y}-${String(M).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
  const vals=ds.map(s=>s>t?null:ocOn(s)), jts=ds.map(s=>s>t?null:jatah(s));
  const maxV=Math.max(1,...vals.filter(v=>v!==null),...jts.filter(v=>v!==null)), top=Math.ceil(maxV*1.15/1000)*1000;
  const Wd=Math.max(320,Math.round($("chart").clientWidth||360)),Ht=200,L=50,R=6,T=10,B=24, cw=(Wd-L-R)/nd, y=v=>T+(Ht-T-B)*(1-v/top);
  let s=`<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Belanja harian dari jatah, ${BLNL[M-1]} ${Y}">`;
  [0,top/2,top].forEach(v=>{ s+=`<line class="gl" x1="${L}" x2="${Wd-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`; });
  ds.forEach((d,i)=>{ const x=L+i*cw, v=vals[i], j=jts[i]; if(v===null) return;
    if(v>0) s+=`<rect class="b${j&&v>j?" over":""}" x="${x+cw*.18}" y="${y(v)}" width="${cw*.64}" height="${Math.max(0,y(0)-y(v))}" rx="2"><title>${d}: ${npr(v)}</title></rect>`;
    if(j) s+=`<line class="jt" x1="${x+cw*.08}" x2="${x+cw*.92}" y1="${y(j)}" y2="${y(j)}"/>`;
    const dn=i+1; if(dn===1||dn%5===0) s+=`<text x="${x+cw/2}" y="${Ht-8}" text-anchor="middle">${dn}</text>`; });
  s+=`</svg>`; $("chart").innerHTML=s;
  const tot=vals.reduce((a,v)=>a+(v||0),0); $("chSub").textContent=`${BLN[M-1]} ${Y} · ${npr(tot)} dari jatah`;
}

/* ---------- archive ---------- */
function renderArch(){
  const items=[]; [...entri.values()].forEach(e=>(e.lampiran||[]).forEach(a=>items.push({a,e})));
  items.sort((x,y)=>y.e.tanggal.localeCompare(x.e.tanggal));
  $("arSub").textContent=items.length?`${items.length} file`:"";
  const A2=$("arch"); A2.innerHTML="";
  if(!items.length){ A2.innerHTML='<p class="note" style="margin:0;grid-column:1/-1">Belum ada nota. Lampirkan foto atau PDF saat menambah entri; semua nota terkumpul di sini.</p>'; return; }
  items.forEach(({a,e})=>{ const d=P(e.tanggal); const el=document.createElement("a"); el.href="#"; el.target="_blank"; el.rel="noopener";
    const isImg=(a.tipe||"").startsWith("image/"); el.dataset.nota=a.id; el.dataset.img=isImg?"1":"0";
    el.innerHTML=`<div class="th">${isImg?"…":"PDF"}</div><small>${d.getUTCDate()} ${BLN[d.getUTCMonth()]} · ${esc(CATL[e.kategori]||"")}<br><span class="num">${esc(e.mataUang)} ${fmt(e.jumlah)}</span></small>`;
    A2.appendChild(el); });
  hydrateNota(A2);
}

let rT=null;
function renderAll(){ if(!db) return; clearTimeout(rT); rT=setTimeout(()=>{ renderSummary(); renderCal(); renderDay(); renderChart(); renderArch(); renderBayar(); },16); }

/* ---------- pembayaran ---------- */
const eur0=n=>"€"+(Math.round(n*100)/100).toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2});
const STATUS={dibayar:"Dibayar",diajukan:"Diajukan, menunggu",proyeksi:"Perkiraan"};
function renderBayar(){
  if(!kontrak||!cfg){ $("pbDiterima").textContent="–"; $("invList").innerHTML='<p class="note" style="margin:0">Data kontrak belum ada.</p>'; return; }
  const sisa=A.proyeksiSisa({hari},kontrak,cfg), pos=A.posisiPembayaran(pembayaran,kontrak,sisa), pl=kontrak.plafonEUR;
  $("pbDiterima").textContent=eur0(pos.dibayar);
  const nDib=pembayaran.filter(p=>p.status==="dibayar").length;
  $("pbSub").innerHTML=`<small>${nDib} pembayaran · biaya yang sudah ditagih ${eur0(pos.biayaTerinvoice)}</small>`;
  const pill=$("pbPill"); const over=pos.ruangPlafon<0; pill.className="pill"+(over?" bad":pos.diajukan>0?" warn":""); pill.textContent=over?"Melewati plafon":pos.diajukan>0?"Ada yang menunggu":"Semua invoice lunas";
  const w=v=>Math.max(0,Math.min(100,v/pl*100))+"%";
  $("pbB1").style.width=w(pos.dibayar); $("pbB2").style.width=w(pos.diajukan); $("pbB3").style.width=w(Math.max(0,pos.invoiceAkhir));
  $("pbBar").setAttribute("aria-label",`Diterima ${Math.round(pos.dibayar/pl*100)} persen dari plafon`);
  $("pbPlafon").textContent=eur0(pl);
  $("pbTotal").textContent=eur0(pos.proyeksiTotal); $("pbTotalS").textContent=`${Math.round(pos.proyeksiTotal/pl*100)}% plafon`;
  $("pbAkhir").textContent=eur0(pos.invoiceAkhir); $("pbAkhirS").textContent=`sampai ${sd(kontrak.akhir)}`;
  $("pbRuang").textContent=(pos.ruangPlafon<0?"−":"")+eur0(Math.abs(pos.ruangPlafon));
  // daftar invoice + baris perkiraan invoice akhir
  const L=$("invList"); L.innerHTML="";
  [...pembayaran].sort((a,b)=>(a.urut||0)-(b.urut||0)).concat([{id:"_akhir",nomor:"Invoice akhir",jenis:"perkiraan",periode:`${sd(A_add(kontrak.invoiceSampai,1))} – ${sd(kontrak.akhir)}`,jumlahEUR:pos.invoiceAkhir,status:"proyeksi"}]).forEach(p=>{
    const el=document.createElement("div"); el.className="inv";
    const bayarInfo=p.status==="dibayar"?(p.tanggalBayar?`diterima ${sd(p.tanggalBayar)}`:"tanggal terima belum dicatat")+(p.diterimaIDR?` · ${rp(p.diterimaIDR)}`:""):p.diajukan?`diajukan ${sd(p.diajukan)}`:"";
    el.innerHTML=`<span class="k">${esc(p.nomor)}${p.jenis?` <span class="note">· ${esc(p.jenis)}</span>`:""}</span><span class="a">${eur0(p.jumlahEUR||0)}</span>
      <span class="d"><span class="chip ${esc(p.status)}">${STATUS[p.status]||esc(p.status)}</span>${p.periode?`<span>${esc(p.periode)}</span>`:""}${bayarInfo?`<span>${esc(bayarInfo)}</span>`:""}${p.catatan?`<span>${esc(p.catatan)}</span>`:""}</span>`;
    if(p.id!=="_akhir"&&(p.status!=="dibayar"||!p.tanggalBayar||!p.diterimaIDR)){
      const act=document.createElement("div"); act.className="act";
      const b=document.createElement("button"); b.type="button"; b.className="btn ghost"; b.textContent=p.status==="dibayar"?"Lengkapi tanggal & Rupiah":"Catat sudah dibayar";
      b.onclick=()=>formBayar(el,p); act.appendChild(b); el.appendChild(act);
    }
    L.appendChild(el);
  });
  $("invSub").textContent=`plafon ${eur0(pl)}`;
  // perkiraan
  const r=(l,v,s2)=>`<div class="r"><span>${l}</span><b>${eur0(v)}</b>${s2?`<small>${s2}</small>`:""}</div>`;
  $("pySub").textContent=`${sd(A_add(kontrak.invoiceSampai,1))} – ${sd(kontrak.akhir)}`;
  $("pyTab").innerHTML=r("Fee",sisa.feeEUR,`${sisa.feeTercatat} hari tercatat + ${sisa.feePerkiraan} hari perkiraan × €${cfg.feePerDay}`)
    +r("Other costs",sisa.ocEUR,`${sisa.ocHari} hari berjatah`)
    +r("Akomodasi",sisa.akomodasiEUR,esc(kontrak.akomodasiCatatan||""))
    +r("Lain-lain",sisa.lainEUR,esc(kontrak.lainCatatan||""))
    +r("Total perkiraan",sisa.totalEUR,"");
  const hfInv=pembayaran.reduce((a,p)=>a+(p.hariFee||0),0), hfTot=hfInv+sisa.feeTercatat+sisa.feePerkiraan, ang=kontrak.hariFeeAnggaran;
  if(ang) $("pyTab").innerHTML+=`<div class="r"><span>Hari fee seluruh kontrak</span><b class="${hfTot>ang?"neg":""}">${hfTot} dari ${ang} hari</b><small>${hfInv} sudah ditagih + ${sisa.feeTercatat+sisa.feePerkiraan} perkiraan${hfTot>ang?` · ${hfTot-ang} hari di atas anggaran perlu persetujuan RVO`:""}</small></div>`;
  $("pyNote").textContent=kontrak.catatan||"";
}
function A_add(s,n){ return addD(s,n); }
function formBayar(el,p){
  if(el.querySelector("form")) return;
  const f=document.createElement("form");
  f.innerHTML=`<div><label>Tanggal diterima</label><input type="date" name="t" value="${esc(p.tanggalBayar||todayISO())}"></div>
    <div><label>Diterima (Rp)</label><input name="idr" class="num" inputmode="decimal" placeholder="mis. 130.000.000" value="${p.diterimaIDR?String(p.diterimaIDR):""}"></div>
    <button class="btn primary" type="submit">Simpan</button>`;
  f.onsubmit=async ev=>{ ev.preventDefault(); const t=f.t.value, idr=num(f.idr.value);
    const body=Object.assign({},p,{status:"dibayar",tanggalBayar:t||null,diterimaIDR:idr||null,updatedAt:new Date().toISOString()}); delete body.id; Object.keys(body).forEach(k=>{ if(k.startsWith("_")) delete body[k]; });
    f.querySelector("button").disabled=true;
    try{ await db.doc("pembayaran/"+p.id).set(body); }catch(e){ f.querySelector("button").disabled=false; alertLine(f,"Gagal menyimpan"); } };
  el.appendChild(f);
}
function alertLine(f,m){ let s=f.querySelector(".status"); if(!s){ s=document.createElement("div"); s.className="status err"; f.appendChild(s);} s.textContent=m; }
function setView(v){ document.body.classList.toggle("view-bayar",v==="bayar"); $("tabHarian").setAttribute("aria-selected",String(v!=="bayar")); $("tabBayar").setAttribute("aria-selected",String(v==="bayar")); if(location.hash!==(v==="bayar"?"#pembayaran":"")) history.replaceState(null,"",v==="bayar"?"#pembayaran":location.pathname); if(v!=="bayar"&&month) renderChart(); }
$("tabHarian").onclick=()=>setView("harian"); $("tabBayar").onclick=()=>setView("bayar");
setView(location.hash==="#pembayaran"?"bayar":"harian");

/* ---------- events ---------- */
$("prevM").onclick=()=>{ const i=MONTHS.indexOf(month); if(i>0){ month=MONTHS[i-1]; renderCal(); renderChart(); } };
$("nextM").onclick=()=>{ const i=MONTHS.indexOf(month); if(i<MONTHS.length-1){ month=MONTHS[i+1]; renderCal(); renderChart(); } };
document.querySelectorAll("#segJenis button").forEach(b=>b.addEventListener("click",()=>{ const v=b.dataset.v, patch={jenis:v}; if(v==="remote") patch.lokasi="luar"; editDay(patch); }));
$("fLok").addEventListener("change",()=>editDay({lokasi:$("fLok").value}));
$("fDayKet").addEventListener("input",()=>editDay({ket:$("fDayKet").value}));
$("daySave").addEventListener("click",()=>saveDay(false));
$("dcForce").addEventListener("click",()=>{ $("dayConflict").classList.add("hide"); saveDay(true); });
$("dcLoad").addEventListener("click",()=>{ dayDirty=false; dayDraft=null; renderDay(); });
$("addBtn").onclick=()=>openSheet(null);
$("eLoc").oninput=()=>renderSugg();
$("moreBtn").onclick=()=>setMore($("cats").classList.contains("hide"));
["eAmt","eCur","ePer"].forEach(id=>{ $(id).addEventListener("input",renderConv); $(id).addEventListener("change",renderConv); });
$("eCancel").onclick=()=>closeSheet(false);
$("eSave").onclick=()=>saveEntry(false);
$("cfForce").onclick=()=>{ $("conflict").classList.add("hide"); saveEntry(true); };
$("cfLoad").onclick=()=>{ const id=form&&form.id; if(id&&entri.get(id)) openSheet(id); else closeSheet(false); };
$("eDel").onclick=()=>{ const e=entri.get(form.id); const n=e&&e.lampiran?e.lampiran.length:0; $("delMsg").textContent=n?`Hapus entri ini beserta ${n} nota terlampir?`:"Hapus entri ini?"; $("delConfirm").classList.remove("hide"); };
$("delNo").onclick=()=>$("delConfirm").classList.add("hide");
$("delYes").onclick=()=>{ $("delConfirm").classList.add("hide"); delEntry(); };
$("btnMasuk").onclick=()=>masuk().catch(e=>{ $("gateMsg").textContent="Gagal masuk: "+(e&&e.code||"coba lagi")+"."; });
$("btnKeluar").onclick=()=>keluar();
$("inImpor").addEventListener("change",async ev=>{
  const f=ev.target.files[0]; ev.target.value=""; if(!f) return;
  const st=$("imStatus");
  try{ const b=JSON.parse(await f.text()); if(!b||!b.koleksi) throw new Error("bukan bundel migrasi");
    if(entri.size||hari.size){ st.textContent="Database sudah berisi data — impor dibatalkan."; st.className="status err"; return; }
    st.textContent="Mengimpor…"; st.className="status";
    const n=await imporBundel(b,(i,t)=>{ st.textContent=`Mengimpor ${i}/${t}…`; });
    st.textContent=`Selesai: ${n} dokumen diimpor.`; st.className="status ok";
  }catch(e){ st.textContent="Impor gagal: "+(e&&(e.code||e.message)); st.className="status err"; }
});

/* ---------- API agen (Claude lewat Chrome; Hermes memakai alat/logharian.py) ---------- */
async function tulisAgen(path, body, alasan){
  if(!alasan||String(alasan).trim().length<5) throw new Error("alasan wajib diisi (siapa minta / kenapa)");
  konteksTulis("agen-chrome", String(alasan).trim());
  try{ await db.doc(path).set(body); } finally{ konteksTulis("halaman",""); }
}
window.LH={
  get siap(){ return Object.values(loaded).every(Boolean); },
  data:()=>({config:cfg, hari:Object.fromEntries(hari), entri:Object.fromEntries(entri), kurs}),
  ringkas:()=>A.ringkas({cfg,hari,entri,kurs}),
  async sidik(){ // sidik jari isi data untuk verifikasi migrasi (kolom jejak "_" diabaikan)
    const enc=s=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join(""));
    const strip=o=>{ const c={...o}; delete c.id; return c; };
    const ent=Object.fromEntries([...entri].map(([k,v])=>[k,strip(v)]));
    const kr=Object.fromEntries(kurs.map(k=>{ const c={...k}; return [k.tanggal,c]; }));
    return { config:await enc(A.kanonik(cfg)), hari:await enc(A.kanonik(Object.fromEntries(hari))), entri:await enc(A.kanonik(ent)), kurs:await enc(A.kanonik(kr)), jumlah:{hari:hari.size,entri:entri.size,kurs:kurs.length} };
  },
  tulisEntri(e,alasan){ const id=e.id||("e"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)); const now=new Date().toISOString(); const old=entri.get(id);
    const body=Object.assign({lampiran:[]},old||{},e,{createdAt:(old&&old.createdAt)||e.createdAt||now,updatedAt:now}); delete body.id; Object.keys(body).forEach(k=>{ if(k.startsWith("_")) delete body[k]; });
    return tulisAgen("entri/"+id,body,alasan).then(()=>id); },
  tulisHari(h,alasan){ const body=Object.assign({},h,{updatedAt:new Date().toISOString()}); Object.keys(body).forEach(k=>{ if(k.startsWith("_")) delete body[k]; }); return tulisAgen("hari/"+h.tanggal,body,alasan); },
  tulisPembayaran(id,p,alasan){ const body={...p,updatedAt:new Date().toISOString()}; delete body.id; return tulisAgen("pembayaran/"+id,body,alasan); },
  tulisKontrak(k,alasan){ return tulisAgen("config/kontrak",{...k},alasan); },
  posisi:()=>{ const s2=A.proyeksiSisa({hari},kontrak,cfg); return {sisa:s2,posisi:A.posisiPembayaran(pembayaran,kontrak,s2)}; },
  tulisKurs(tanggal,k,alasan){ const body={...k}; delete body.tanggal; return tulisAgen("kurs/"+tanggal,body,alasan); },
  async hapusEntri(id,alasan){ if(!alasan) throw new Error("alasan wajib diisi"); konteksTulis("agen-chrome",alasan); try{ await db.doc("entri/"+id).delete(); } finally{ konteksTulis("halaman",""); } },
};

/* ---------- boot ---------- */
const t0=todayISO(); sel=t0; month=MONTHS.includes(t0.slice(0,7))?t0.slice(0,7):(t0<"2026-09-01"?MONTHS[0]:MONTHS[MONTHS.length-1]);
$("todayLbl").textContent=longD(t0);
let unsub=[];
pantauAkun(async user=>{
  unsub.forEach(u=>u()); unsub=[]; db=null; assets=null;
  if(!user){ $("gate").classList.remove("hide"); $("app").classList.add("hide"); $("akun").classList.add("hide"); return; }
  $("akunEmail").textContent=user.email; $("akun").classList.remove("hide");
  try{ await fdb.doc("config/params").get(); }
  catch(e){
    $("gate").classList.remove("hide"); $("app").classList.add("hide"); $("btnMasuk").classList.add("hide");
    $("gateMsg").innerHTML=`Akun <b>${esc(user.email)}</b> belum diberi akses. Kirim kode ini ke Adib/Claude untuk didaftarkan: <code>${esc(user.uid)}</code>`;
    return;
  }
  $("gate").classList.add("hide"); $("app").classList.remove("hide");
  db=fdb; assets=fassets; window.LH.akun=user.email;
  const err=e=>{ $("dayT").textContent="Koneksi data terputus — muat ulang halaman."; console.error(e); };
  unsub.push(db.doc("config/params").onSnapshot(s=>{ cfg=s.exists?s.data():null; loaded.config=true; renderAll(); },err));
  unsub.push(db.collection("kurs").onSnapshot(q=>{ const a=[]; q.docs.forEach(d=>{ if(d.exists) a.push(Object.assign({tanggal:d.id},d.data())); }); a.sort((x,y)=>x.tanggal.localeCompare(y.tanggal)); kurs=a; loaded.kurs=true; renderAll(); },err));
  unsub.push(db.collection("hari").onSnapshot(q=>{ const m=new Map(); q.docs.forEach(d=>{ if(d.exists){ const v=d.data(); m.set(v.tanggal||d.id,Object.assign({tanggal:d.id},v)); } }); hari=m; loaded.hari=true; renderAll(); $("secImpor").classList.toggle("hide",!!(hari.size||entri.size)); },err));
  unsub.push(db.doc("config/kontrak").onSnapshot(sn=>{ kontrak=sn.exists?sn.data():null; renderAll(); },err));
  unsub.push(db.collection("pembayaran").onSnapshot(q=>{ pembayaran=q.docs.filter(d=>d.exists).map(d=>Object.assign({id:d.id},d.data())); renderAll(); },err));
  unsub.push(db.collection("entri").onSnapshot(q=>{ const m=new Map(); q.docs.forEach(d=>{ if(d.exists) m.set(d.id,Object.assign({id:d.id},d.data())); }); entri=m; loaded.entri=true; renderAll(); $("secImpor").classList.toggle("hide",!!(hari.size||entri.size)); },err));
});

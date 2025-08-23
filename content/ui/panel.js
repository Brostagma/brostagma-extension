// content/ui/panel.js — Kompakt “mock’a %98” panel (kapatma/küçültme yok)
// v3.9.5 sözleşmesine sadık: id’ler / API’ler korunur.
(function (ns) {
  // GM_addStyle polyfill (MV3'te yoksa paneli engellemesin)
  if (typeof window.GM_addStyle === "undefined") {
    window.GM_addStyle = function (css) {
      try {
        const st = document.createElement("style");
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
      } catch (e) {}
    };
  }

  const { CFG = {}, State = {}, Util = {} } = ns;

  // ---- Theme & layout -------------------------------------------------------
  const UI_Z = (CFG.UI && Number(CFG.UI.Z) > 1e7) ? CFG.UI.Z : 2147483647;
  const ROOT_ID  = "ep-root";
  const ROOT_SIG = "empro-v395-compact";
  const MIN_W = Math.max(360, (CFG.UI && CFG.UI.MIN_WIDTH) || 360);

  GM_addStyle(`
:root{
  --ep-ink:#E6EAF2; --ep-sub:#9BA7BD; --ep-bd:#22304A;
  --ep-bg1:rgba(12,18,31,.92); --ep-bg2:rgba(8,12,23,.98);
  --ep-hdr-g1:#1D6B4C; --ep-hdr-g2:#0C4A6E;
  --ep-pill:#0B1220; --ep-pill-bd:#1F2A44;
  --ep-ok:#16A34A; --ep-blue:#2EA4F4; --ep-warn:#F59E0B; --ep-err:#EF4444;
  --ep-z:${UI_Z};
}
#${ROOT_ID}{
  position:fixed; z-index:var(--ep-z); top:20px; left:20px;
  min-width:${MIN_W}px; width:760px;
  color:var(--ep-ink);
  background:linear-gradient(180deg,var(--ep-bg1),var(--ep-bg2));
  border:1px solid var(--ep-bd); border-radius:14px;
  box-shadow:0 20px 56px rgba(0,0,0,.55); overflow:hidden;
  font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  user-select:none;
}
#${ROOT_ID} .hdr{
  height:46px; display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:8px 14px;
  background:linear-gradient(90deg, color-mix(in srgb, var(--ep-hdr-g1) 75%, transparent), color-mix(in srgb, var(--ep-hdr-g2) 75%, transparent));
  border-bottom:1px solid var(--ep-bd);
}
#${ROOT_ID} .brand{ display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:.2px; }
#${ROOT_ID} .brand .title{ font-size:16px; color:#BFF3D2; }
#${ROOT_ID} .brand .sub{ opacity:.85; font-size:12px; color:#D5EAE9; }
#${ROOT_ID} .hdr .right{ display:flex; align-items:center; gap:8px; }
#${ROOT_ID} .pill{
  background:var(--ep-pill); border:1px solid var(--ep-pill-bd);
  border-radius:10px; padding:7px 10px; display:flex; align-items:center; gap:8px;
}

#${ROOT_ID} .body{ padding:12px; display:flex; flex-direction:column; gap:12px; }

/* stats */
#${ROOT_ID} .stats{ display:grid; grid-template-columns:1fr 1fr 1.2fr; gap:10px; }
#${ROOT_ID} .stat{
  background:var(--ep-pill); border:1px solid var(--ep-pill-bd);
  border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:4px;
}
#${ROOT_ID} .stat .k{ font-size:11px; color:var(--ep-sub); }
#${ROOT_ID} .stat .v{ font-size:20px; font-weight:900; letter-spacing:.4px; }

/* DC stat composite */
#${ROOT_ID} .dcbox{ display:flex; align-items:center; gap:8px; }
#${ROOT_ID} .dc-tag{ font-weight:800; font-size:12px; padding:3px 8px; border-radius:999px; background:#0C3B2A; border:1px solid #195B41; color:#BFF3D2; }
#${ROOT_ID} .dc-dot{ min-width:26px; padding:2px 8px; border-radius:8px; background:#0B1220; border:1px solid #2A3B58; text-align:center; font-weight:800; }

/* row blocks */
#${ROOT_ID} .row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
#${ROOT_ID} .grow{ flex:1 1 auto; }
#${ROOT_ID} .btn{
  border:1px solid #294160; background:#0B1220; color:var(--ep-ink);
  padding:8px 12px; border-radius:10px; cursor:pointer; transition:transform .06s ease;
}
#${ROOT_ID} .btn:active{ transform:translateY(1px); }
#${ROOT_ID} .btn.green{ background:#0E2E1C; border-color:#185C3A; }
#${ROOT_ID} .btn.blue { background:#0A2749; border-color:#1E4F85; }
#${ROOT_ID} .btn.red  { background:#391313; border-color:#6B1B1B; }
#${ROOT_ID} .btn:disabled{ opacity:.6; cursor:not-allowed; }

#${ROOT_ID} .switch{ display:flex; align-items:center; gap:8px; background:var(--ep-pill); border:1px solid var(--ep-pill-bd); border-radius:10px; padding:7px 10px; }
#${ROOT_ID} .switch input{ width:32px; height:18px; }

#${ROOT_ID} .info{ color:var(--ep-sub); font-size:11px; }

#${ROOT_ID} .bar{ height:4px; background:#0B1220; border:1px solid #1F2A44; border-radius:3px; overflow:hidden; }
#${ROOT_ID} .bar-in{ height:100%; width:0%; background:linear-gradient(90deg,#22C55E,#06B6D4); }

#${ROOT_ID} .inp{
  width:86px; background:#0B1220; border:1px solid #2A3B58; border-radius:10px;
  color:var(--ep-ink); padding:8px 10px; font-size:12px;
}

/* campaign chips */
#${ROOT_ID} .chips{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#${ROOT_ID} .chip{
  display:flex; align-items:center; gap:6px;
  background:var(--ep-pill); border:1px solid var(--ep-pill-bd); border-radius:999px; padding:6px 10px;
}
#${ROOT_ID} .chip input{ width:14px; height:14px; }

/* file actions */
#${ROOT_ID} .file-act{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
#${ROOT_ID} .file-info{ margin-left:auto; color:var(--ep-sub); font-size:11px; }

@media (max-width:920px){
  #${ROOT_ID}{ width:92vw; left:4vw; }
}
  `);

  // ---- small helpers --------------------------------------------------------
  function h(tag, attrs={}, html=""){
    const el=document.createElement(tag);
    for(const k in attrs){
      if(k==="class") el.className=attrs[k];
      else if(k==="style") el.setAttribute(k, attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    if(html) el.innerHTML=html;
    return el;
  }
  const esc = Util.escapeHtml || (s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])));

  // ---- build ---------------------------------------------------------------
  function buildPanel(){
    if(document.getElementById(ROOT_ID)) return;

    const root = h("div",{ id:ROOT_ID, "data-sig":ROOT_SIG });

    // Header
    const hdr  = h("div",{ class:"hdr" });
    hdr.innerHTML = `
      <div class="brand">
        <span style="width:10px;height:10px;border-radius:50%;background:var(--ep-ok);display:inline-block"></span>
        <span class="title">Kampanya Tarayıcı</span>
        <span class="sub">— Emin Pro <b>3.9.5</b></span>
      </div>
      <div class="right">
        <div class="pill info">threshold: none</div>
      </div>
    `;

    // Stats
    const stats = h("div",{ class:"stats" });
    stats.innerHTML = `
      <div class="stat">
        <div class="k">Toplam Kart</div>
        <div class="v" id="ep-c-scan">0</div>
      </div>
      <div class="stat">
        <div class="k">Eşleşen</div>
        <div class="v" id="ep-c-match">0</div>
      </div>
      <div class="stat">
        <div class="k">DC</div>
        <div class="dcbox">
          <span class="dc-tag">DC</span>
          <span class="dc-dot" id="ep-dc-q">0</span>
          <span class="dc-dot" id="ep-dc-a">0</span>
        </div>
      </div>
    `;

    // Operations row
    const ops = h("div",{ class:"row" });
    ops.innerHTML = `
      <button id="ep-btn-export-matches" class="btn green">Eşleşenleri indir (.xlsx)</button>
      <div class="switch"><label>DC</label><input id="ep-sw-dc" type="checkbox" checked></div>
      <div class="switch"><label>Benzer</label><input id="ep-sw-sim" type="checkbox" checked></div>
      <span class="info">İndirilecek: <b id="ep-dl-count">0</b></span>
      <div class="grow"></div>
    `;

    // Status + progress
    const status = h("div",{ class:"row" });
    status.innerHTML = `
      <div class="pill">Durum</div>
      <div class="info" id="ep-status">Hazır</div>
      <div class="grow"></div>
    `;
    const bar = h("div",{ class:"bar" }, `<div id="ep-prog-in" class="bar-in"></div>`);

    // Step / Delay
    const ctrl = h("div",{ class:"row" });
    ctrl.innerHTML = `
      <div class="pill">Adım</div><input id="ep-step" class="inp" type="number" value="${CFG.DEF?.STEP||500}" min="100" max="2000"><span class="info">px</span>
      <div class="pill">Bekleme</div><input id="ep-delay" class="inp" type="number" value="${CFG.DEF?.DELAY||800}" min="100" max="3000"><span class="info">ms</span>
      <button id="ep-btn-start" class="btn green">Başlat</button>
      <button id="ep-btn-reset" class="btn red">Sıfırla</button>
      <div class="grow"></div>
    `;

    // Campaign types
    const chips = h("div",{ class:"chips" });
    chips.innerHTML = `
      <div class="pill">Kampanya Tipleri</div>
      <label class="chip"><input type="checkbox" checked> X Al Y Öde</label>
      <label class="chip"><input type="checkbox" checked> 2. Ürün 1 TL</label>
      <label class="chip"><input type="checkbox" checked> 2. Ürün %</label>
      <label class="chip"><input type="checkbox"> 2. Ürün Bedava</label>
      <label class="chip"><input type="checkbox"> Sepette %</label>
      <label class="chip"><input type="checkbox"> Sepette TL</label>
      <label class="chip"><input type="checkbox"> Kupon TL</label>
      <label class="chip"><input type="checkbox"> Anında %</label>
    `;

    // File actions
    const file = h("input",{ type:"file", accept:".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel", style:"display:none" });
    const files = h("div",{ class:"file-act" });
    files.innerHTML = `
      <button id="ep-btn-upload" class="btn blue">Hedef Liste (.xlsx)</button>
      <button id="ep-btn-targets-clean" class="btn">Ayıklanmış (.xlsx)</button>
      <button id="ep-btn-targets-clear" class="btn red">Temizle</button>
      <div class="file-info">Hedef listesi: <span id="ep-target-info">0 kayıt</span></div>
    `;

    const body = h("div",{ class:"body" });
    body.append(stats, ops, status, bar, ctrl, chips, files, file);
    root.append(hdr, body);
    document.body.appendChild(root);

    // --------- Events / API (sözleşme) --------------------------------------
    // Dosya Yükleme
    file.addEventListener("change", async (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if(!f) return;
      try{
        await ns.Targets.importXlsx(f);
        ns.UI.updateCounters && ns.UI.updateCounters();
        ns.UI.toast && ns.UI.toast("Hedef listesi yüklendi","ok");
      }catch(e){ console.error("[Import XLSX]", e); ns.UI.toast && ns.UI.toast("Yükleme hatası","err"); }
      finally{ file.value=""; }
    });
    files.querySelector("#ep-btn-upload").addEventListener("click",(e)=>{
      e.preventDefault(); e.stopPropagation();
      try{ if (file.showPicker) file.showPicker(); else file.click(); }catch{}
    });
    files.querySelector("#ep-btn-targets-clean").addEventListener("click", async ()=>{
      try{ await ns.Targets.exportCleanXlsx(); ns.UI.toast && ns.UI.toast("Ayıklanmış indirildi","ok"); }
      catch(e){ ns.UI.toast && ns.UI.toast("İndirme hatası","err"); }
    });
    files.querySelector("#ep-btn-targets-clear").addEventListener("click", ()=>{
      try{ ns.Targets.clear(); ns.UI.toast && ns.UI.toast("Hedef listesi temizlendi","warn"); }catch{}
    });

    // Export matches: en az 1 eşleşme
    ops.querySelector("#ep-btn-export-matches").addEventListener("click", ()=>{
      const list = (State.matchedList||[]);
      if(!list.length){ ns.UI.toast && ns.UI.toast("Eşleşme yok","warn"); return; }
      ns.UI.toast && ns.UI.toast("Eşleşenler indiriliyor…","info");
      // XLSX export mevcut akışınızda
    });

    // Start/Reset
    ctrl.querySelector("#ep-btn-start").addEventListener("click", ()=>{
      const tgl = ns.App?.toggleAutoScroll?.();
      ns.UI.setStatus && ns.UI.setStatus(tgl ? "Otomatik kaydırma: Açık" : "Otomatik kaydırma: Kapalı");
      ns.UI.toast && ns.UI.toast(tgl ? "Otomatik kaydırma açıldı" : "Otomatik kaydırma kapatıldı", tgl?"ok":"warn");
    });
    ctrl.querySelector("#ep-btn-reset").addEventListener("click", ()=>{
      ns.App?.stopAutoScroll?.();
      State.scanned=0; State.matchedList=[];
      ns.UI.updateCounters && ns.UI.updateCounters();
      ns.UI.setStatus && ns.UI.setStatus("Sıfırlandı");
      ns.UI.toast && ns.UI.toast("Sayaçlar sıfırlandı","warn");
    });

    // DC / Benzer bildirimleri
    ops.querySelector("#ep-sw-dc").addEventListener("change", (e)=>{
      ns.UI.toast && ns.UI.toast(e.target.checked ? "DC açık" : "DC kapalı", e.target.checked?"ok":"warn");
    });
    ops.querySelector("#ep-sw-sim").addEventListener("change", (e)=>{
      ns.UI.toast && ns.UI.toast(e.target.checked ? "Benzer: açık" : "Benzer: kapalı", e.target.checked?"info":"warn");
    });

    // Public UI API — v3.9.5 sözleşmesi
    const api = {
      refreshTargetsInfo(){
        try{
          const info = ns.Targets && ns.Targets.lastReport;
          const el = document.getElementById("ep-target-info");
          if (!el) return;
          if (!info){ el.textContent = "0 kayıt"; return; }
          el.textContent = `${info.total} kayıt • Marka:${info.brandCount} • Ürün:${info.nameCount} • Kategori:${info.uniqueCategoryCount}`;
        }catch{}
      },
      updateCounters(){
        try{
          const total   = State.scanned || 0;
          const matched = (State.matchedList && State.matchedList.length) || 0;
          const st = ns.DeepCampaign?.stats?.() || { queued:0, inFlight:0 };
          const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=String(v); };
          set("ep-c-scan", total);
          set("ep-c-match", matched);
          set("ep-dc-q", st.queued||0);
          set("ep-dc-a", st.inFlight||0);
          const btn = document.getElementById("ep-btn-export-matches");
          if (btn) btn.disabled = matched<1;
          const dl = document.getElementById("ep-dl-count"); if (dl) dl.textContent = String(matched);
        }catch{}
      },
      setStatus(msg){
        const el=document.getElementById("ep-status"); if(el) el.textContent=String(msg||"");
        ns.UI.toast && ns.UI.toast(msg,"info");
      },
      ensurePanel(){ /* tekil panel */ }
    };
    ns.UI = Object.assign(ns.UI||{}, api);

    // İlk durum
    api.refreshTargetsInfo();
    api.updateCounters();
  }

  // ---- init -----------------------------------------------------------------
  function ensurePanel(){ if(!document.getElementById(ROOT_ID)) buildPanel(); }
  ns.UI = Object.assign(ns.UI||{}, { ensurePanel });

  // Body hazır değilse beklet
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensurePanel, { once: true });
  } else {
    ensurePanel();
  }
})(window.EminPro = window.EminPro || {});

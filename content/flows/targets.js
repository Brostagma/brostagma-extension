/* Targets — v3.9.5 uyumlu
 * - XLSX içe al / normalize / tekilleştir
 * - Marka/Ürün/Kategori ayrıştırma
 * - Benzersiz kategori sayımı
 * - Rapor + UI senkronizasyonu
 * - Ayıklanmış (.xlsx) indirme
 * - Temizle + depolama
 * - CustomEvent: eminpro:targets-updated / eminpro:targets-cleared
 */
(function(ns){
  const State   = ns.State   || (ns.State = {});
  const Lexicon = ns.Lexicon || {};
  const UI      = ns.UI      || {};
  const Util    = ns.Util    || {};

  const SKEY = {
    TARGETS: "eminpro_v395_targets",
    REPORT:  "eminpro_v395_targets_report"
  };

  // ---- küçük yardımcılar ----
  function safeJSONset(key, val){
    try{
      if (typeof GM_setValue === "function") { GM_setValue(key, val); return; }
      localStorage.setItem(key, JSON.stringify(val));
    }catch(e){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }
  }
  function safeJSONget(key, def){
    try{
      if (typeof GM_getValue === "function") return GM_getValue(key, def);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    }catch{ return def; }
  }

  // Normalize (Lexicon.norm varsa onu kullan)
  function norm(s){
    if (Lexicon && typeof Lexicon.norm === "function") return Lexicon.norm(s);
    return String(s||"").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  }
  function nonEmpty(x){ return !!(x && String(x).trim()!==""); }

  // Header tespiti (TR/EN varyantları)
  function detectHeaders(row0){
    const h = (row0||[]).map(c=>norm(c));
    const idx = {
      brand: h.findIndex(x=>/\b(marka|brand)\b/i.test(x)),
      name:  h.findIndex(x=>/\b(ürün|urun|product|title|isim|ad|name)\b/i.test(x)),
      cat:   h.findIndex(x=>/\b(kategori|category|kat|cat)\b/i.test(x)),
    };
    // name bulunamazsa: en uzun metinli sütunu isim kabul et
    if (idx.name < 0){
      let maxLen = -1, best = -1;
      for (let i=0;i<h.length;i++){
        const l = String(row0[i]||"").length;
        if (l > maxLen){ maxLen = l; best = i; }
      }
      if (best>=0) idx.name = best;
    }
    return idx;
  }

  function rowsFromSheet(ws){
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
    if (!rows.length) return [];
    const header = rows[0];
    const idx = detectHeaders(header);
    const out = [];

    for (let r=1;r<rows.length;r++){
      const row = rows[r] || [];
      const brand = idx.brand>=0 ? String(row[idx.brand]||"").trim() : "";
      const name0 = idx.name >=0 ? String(row[idx.name] ||"").trim() : "";
      const cat   = idx.cat  >=0 ? String(row[idx.cat]  ||"").trim() : "";

      // Heuristik: yalnızca tek hücre doluysa onu ürün adı say
      let name = name0;
      if (!nonEmpty(name)){
        const only = row.map(x=>String(x||"").trim()).filter(x=>x!=="");
        if (only.length===1) name = only[0];
      }

      // Tamamen boş satırı atla
      if (!nonEmpty(brand) && !nonEmpty(name) && !nonEmpty(cat)) continue;

      const raw = [brand,name,cat].filter(nonEmpty).join(" | ");
      out.push({ brand, name, category:cat, raw });
    }
    return out;
  }

  function dedupeRows(rows){
    const uniq = [];
    const seen = new Set();
    for (const r of rows){
      const k = [norm(r.brand), norm(r.name), norm(r.category)].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(r);
    }
    return uniq;
  }

  function buildReport(rows){
    const total = rows.length;
    let brandCount=0, nameCount=0, emptyName=0;
    const catSet = new Set();
    const keySet = new Set();
    let dupCount=0;

    for (const r of rows){
      if (nonEmpty(r.brand)) brandCount++;
      if (nonEmpty(r.name))  nameCount++; else emptyName++;
      if (nonEmpty(r.category)) catSet.add(norm(r.category));
      const k = [norm(r.brand), norm(r.name), norm(r.category)].join("|");
      if (keySet.has(k)) dupCount++; else keySet.add(k);
    }

    return {
      total,
      brandCount,
      nameCount,               // “Ürün” sayısı olarak panelde kullanılabilir
      uniqueCategoryCount: catSet.size,
      dupCount,
      emptyName
    };
  }

  async function fileToRows(file){
    const buf = await file.arrayBuffer();
    const data = new Uint8Array(buf);
    const wb = XLSX.read(data, { type:"array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("Excel sayfası bulunamadı");
    return rowsFromSheet(ws);
  }

  async function exportRowsAsXlsx(rows, fname){
    const header = ["Marka","Ürün","Kategori"];
    const data = [header, ...rows.map(r=>[r.brand||"", r.name||"", r.category||""])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HedefListe");
    const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    // FileSaver varsa onu kullan, yoksa writeFile
    if (typeof saveAs === "function") saveAs(blob, fname);
    else XLSX.writeFile(wb, fname);
  }

  // ---- Targets API ----
  const Targets = {
    current: { rows: [] },
    lastReport: null,

    /** XLSX içe al ve State'e yaz */
    async importXlsx(file){
      if (!file) throw new Error("Dosya seçilmedi");
      const rows = await fileToRows(file);

      // Tekilleştir
      const uniq = dedupeRows(rows);

      // Durumu güncelle
      this.current.rows = uniq;
      const rep = buildReport(uniq);
      this.lastReport = rep;

      // Depola
      safeJSONset(SKEY.TARGETS, uniq);
      safeJSONset(SKEY.REPORT,  rep);

      // Lexicon'u güncelle (dinamik stop için)
      try{ Lexicon && typeof Lexicon.rebuild === "function" && Lexicon.rebuild(); }catch(e){}

      // UI'yi yenile
      try{ UI && typeof UI.refreshTargetsInfo === "function" && UI.refreshTargetsInfo(); }catch(e){}
      try{ UI && typeof UI.toast === "function" && UI.toast("Hedef listesi yüklendi","ok"); }catch(e){}

      // Bildir
      try{
        document.dispatchEvent(new CustomEvent("eminpro:targets-updated",{ detail:{ rows:uniq, report:rep }}));
      }catch{}

      return rep;
    },

    /** Ayıklanmış (tekilleştirilmiş) içeriği .xlsx olarak indir */
    async exportCleanXlsx(){
      const rows = Array.isArray(this.current.rows) ? this.current.rows : [];
      if (!rows.length) throw new Error("Ayıklanmış liste boş");
      await exportRowsAsXlsx(rows, "HedefListe-ayiklanmis.xlsx");
    },

    /** Hedef listesini temizle */
    clear(){
      this.current.rows = [];
      this.lastReport = { total:0, brandCount:0, nameCount:0, uniqueCategoryCount:0, dupCount:0, emptyName:0 };
      safeJSONset(SKEY.TARGETS, this.current.rows);
      safeJSONset(SKEY.REPORT,  this.lastReport);

      try{ UI && typeof UI.refreshTargetsInfo === "function" && UI.refreshTargetsInfo(); }catch(e){}
      try{ UI && typeof UI.toast === "function" && UI.toast("Hedef listesi temizlendi","warn"); }catch(e){}

      try{ document.dispatchEvent(new CustomEvent("eminpro:targets-cleared")); }catch{}
    },

    /** Depodan yükle (varsa) ve UI'yi güncelle */
    loadFromStorage(){
      const rows = safeJSONget(SKEY.TARGETS, []);
      const rep  = safeJSONget(SKEY.REPORT, null) || buildReport(rows);
      this.current.rows = Array.isArray(rows) ? rows : [];
      this.lastReport = rep;

      try{ UI && typeof UI.refreshTargetsInfo === "function" && UI.refreshTargetsInfo(); }catch(e){}
      return { rows:this.current.rows, report:this.lastReport };
    },

    /** Okuma yardımcıları */
    getRows(){ return Array.isArray(this.current.rows) ? this.current.rows.slice() : []; },
    getReport(){ return this.lastReport ? Object.assign({}, this.lastReport) : null; }
  };

  ns.Targets = Targets;

  // Otomatik yükle (varsa) — sayfa açılışında panel bilgi çubuğu güncellensin
  try{ Targets.loadFromStorage(); }catch{}
})(window.EminPro = window.EminPro || {});

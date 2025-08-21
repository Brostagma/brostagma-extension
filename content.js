// content.js
// ——— GM_* uyumluluk katmanı (MV3) ———
(() => {
  const cache = {};
  const ready = new Promise((resolve) => {
    try {
      chrome.storage.local.get(null, (items) => {
        Object.assign(cache, items || {});
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });

  window.GM_getValue = (key, defVal) =>
    (Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : defVal);

  window.GM_setValue = (key, val) => {
    cache[key] = val;
    try { chrome.storage.local.set({ [key]: val }); } catch (_) {}
  };

  window.GM_addStyle = (css) => {
    const s = document.createElement("style");
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };

  // Menü komutları uzantıda opsiyonel — no-op bırakıyoruz:
  window.GM_registerMenuCommand = function () { /* no-op in extension */ };

  // FileSaver & XLSX vendor dosyaları manifest ile içerik scriptinden önce yüklenecek.
  // Şimdi asıl uygulama kodunu başlat:
  ready.then(() => {
    (function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────────────────────
  const CFG = {
    PREF: {
      TARGETS: "brostagmapro_v360_targets",
      ALLOW_SIMILAR: "brostagmapro_v360_allow_similar",
      STEP: "brostagmapro_v360_scroll_step",
      DELAY: "brostagmapro_v360_scroll_delay",
      PANEL_POS: "brostagmapro_v360_panel_pos",
      PANEL_COLLAPSE: "brostagmapro_v360_panel_collapsed",
      CAMP_FILTERS: "brostagmapro_v360_campaign_filters",
      DC_ENABLED: "brostagmapro_v360_dc_enabled",
      DEBUG: "brostagmapro_v360_debug",
      NEG_USER: "brostagmapro_v362_neg_user",             // ← yeni: kullanıcıya özel NEG anahtarlar
    },
    DEF: {
      ALLOW_SIMILAR: true,
      STEP: 500,
      DELAY: 800,
      DC_ENABLED: true,
      DEBUG: false,
    },
    DC: {
      CONCURRENCY: 2,
      DELAY_MIN_MS: 1200,
      DELAY_MAX_MS: 1500,
      COOLDOWN_MS: 60000,
    },
    SELECTOR: {
      CARD: [
        "div.p-card-wrppr",
        "div.product-down",
        "div[data-testid*='product-card']",
        "div[data-testid*='productCard']",
        "div[class*='prdct-card']",
      ].join(","),
      LINK: "a[href*='/p/'], a[href*='-p-']",
      GRID_CANDIDATE:
        "[data-testid*='productGrid'], .prdct-cntnr, #search-app, [class*='prdct-cntnr']",
    },
    UI: {
      MIN_WIDTH: 320,
      Z: 2147483647,
      VERSION: "3.6.2",
    },
    CAMPAIGN_TYPES: [
      "X Al Y Öde",
      "2. Ürün 1 TL",
      "2. Ürün %",
      "2. Ürün Bedava",
      "Sepette %",
      "Sepette TL",
      "Kupon TL",
      "Anında %",
      "Anında TL",
      "Kargo Bedava",
    ],
  };

  const DEFAULT_FILTERS = (() => {
    const on = new Set(CFG.CAMPAIGN_TYPES);
    on.delete("Kupon TL");
    on.delete("Anında %");
    on.delete("Anında TL");
    on.delete("Kargo Bedava");
    return [...on];
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────
  const Util = {
    norm: (s) => (s || "").replace(/\s+/g, " ").trim(),
    clamp: (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; },
    jitter(min, max) { return Math.floor(min + Math.random() * (Math.max(max, min) - min + 1)); },
    round2: (x) => Math.round(x * 100) / 100,
    stripDiacritics: (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    normalizeText(str) {
      return Util.stripDiacritics((str || "").toLowerCase())
        .replace(/₺/g, " tl ")
        .replace(/[%％]/g, "%")
        .replace(/\s+/g, " ")
        .trim();
    },
    parsePrice(t) {
      if (!t) return null;
      const cleaned = (t || "").replace(/[^\d,\.]/g, " ").replace(/\s+/g, " ").trim();
      const m = cleaned.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/);
      if (!m) return null;
      const raw = m[1].replace(/\s/g, "");
      const val = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      const f = parseFloat(val);
      return Number.isFinite(f) ? f : null;
    },
    escapeHtml: (s) =>
      (s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])),
    absolute(url) { try { return new URL(url, location.origin).href; } catch { return url; } },
    canonicalKey(href) {
      try {
        const u = new URL(href, location.origin);
        u.search = ""; u.hash = "";
        let m = u.pathname.match(/-p-(\d+)(?:$|[\/?#])/);
        if (m) return m[1];
        m = u.pathname.match(/\/p\/.*?-(\d+)(?:$|[\/?#])/);
        if (m) return m[1];
        return u.pathname;
      } catch { return (href || "").split("?")[0]; }
    },
    waitForBody(cb, tries = 0) {
      if (document.body) return cb();
      if (tries > 100) return;
      setTimeout(() => Util.waitForBody(cb, tries + 1), 100);
    },
    log(...a) { if (State.DEBUG) console.log("[Brostagma 3.6.2]", ...a); },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const State = {
    TARGETS: normalizeTargets(GM_getValue(CFG.PREF.TARGETS, [])),
    ALLOW_SIMILAR: GM_getValue(CFG.PREF.ALLOW_SIMILAR, CFG.DEF.ALLOW_SIMILAR),

    SCROLL_STEP: GM_getValue(CFG.PREF.STEP, CFG.DEF.STEP),
    SCROLL_DELAY: GM_getValue(CFG.PREF.DELAY, CFG.DEF.DELAY),

    DEBUG: GM_getValue(CFG.PREF.DEBUG, CFG.DEF.DEBUG),
    DC_ENABLED: GM_getValue(CFG.PREF.DC_ENABLED, CFG.DEF.DC_ENABLED),

    ui: null,
    gridRoot: null,
    scrollRoot: null,
    scrollListenerTarget: null,
    cardObserver: null,
    gridMutationObserver: null,
    globalMutationObserver: null,
    autoTimer: null,

    totalCardKeys: new Set(),
    processedCount: 0,

    catalog: new Map(),
    matchedList: [],
    keyOrder: [],
    MAX_SCANNED_KEEP: 9000,

    recheckObservers: new WeakMap(),
    recheckTimers: new WeakMap(),
    recheckFlags: new WeakMap(),
    observedCards: new WeakSet(),

    enabledCampaignTypes: new Set(GM_getValue(CFG.PREF.CAMP_FILTERS, DEFAULT_FILTERS)),

    // Dinamik sözlük
    LEX: null,
    STOP_DYNAMIC: new Set(),

    // Kullanıcıya özel NEG anahtarları (opsiyonel)
    NEG_USER: new Set(
      (GM_getValue(CFG.PREF.NEG_USER, []) || []).map((x) => String(x || "").trim()).filter(Boolean)
    ),

    // Derin tarama
    dcQueue: [],
    inFlight: 0,
    aborters: new Map(),
    cooldownUntil: 0,

    lastParsedReport: { brandCount: 0, nameCount: 0, categoryCount: 0 },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Dinamik Sözlük + STOP
  // ─────────────────────────────────────────────────────────────────────────────
  const Lexicon = (() => {
    function normalizeRoot(t) {
      t = Util.stripDiacritics((t || "").toLowerCase()).replace(/[^\p{L}\p{N}]/gu, "");
      if (!t) return "";
      t = t
        .replace(/(ları|leri)$/i, "")
        .replace(/(lar|ler)$/i, "")
        .replace(/(lık|lik|luk|lük)$/i, "")
        .replace(/(lı|li|lu|lü)$/i, "")
        .replace(/(cı|ci|cu|cü|çı|çi|çu|çü)$/i, "");
      return t;
    }
    function tokenize(s) {
      return Util.norm(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map(normalizeRoot)
        .filter(Boolean);
    }
    function buildFromTargets(targets) {
      const tokenFreq = new Map();
      const brandSetByToken = new Map();
      for (const t of targets || []) {
        const bt = tokenize(t.brand);
        const nt = tokenize(t.name);
        const ct = tokenize(t.category);
        const all = [...bt, ...nt, ...ct];
        const brandSig = bt.join(" ") || "_";
        for (const w of all) {
          tokenFreq.set(w, (tokenFreq.get(w) || 0) + 1);
          if (brandSig) {
            const s = brandSetByToken.get(w) || new Set();
            s.add(brandSig);
            brandSetByToken.set(w, s);
          }
        }
      }
      const vocab = new Set(tokenFreq.keys());

      // Dinamik STOP: sık ve ayırt edici olmayanlar
      const dynamic = new Set();
      const N = Math.max(1, (targets || []).length);
      const FREQ_RATIO = 0.3;
      for (const [tok, freq] of tokenFreq) {
        const ratio = freq / N;
        const brandSpread = (brandSetByToken.get(tok) || new Set()).size;
        const isShort = tok.length <= 3;
        const frequent = ratio >= FREQ_RATIO || (isShort && ratio >= FREQ_RATIO * 0.6);
        const nonDistinct = brandSpread >= Math.min(5, Math.ceil(N * 0.15));
        if (frequent && nonDistinct) dynamic.add(tok);
      }
      State.STOP_DYNAMIC = dynamic;
      return { vocab, tokenFreq };
    }
    function rebuild() {
      State.LEX = buildFromTargets(State.TARGETS);
      Util.log("Lexicon rebuilt:", {
        vocab: State.LEX?.vocab?.size,
        targets: State.TARGETS.length,
        dynStop: State.STOP_DYNAMIC.size,
      });
      Match.setDynamicStop(State.STOP_DYNAMIC);
    }
    function has(word) { return !!State?.LEX?.vocab?.has(word); }
    return { rebuild, has, normalizeRoot, tokenize };
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  // Negatif filtre (tamamen kullanıcıya bağlı — opsiyonel)
  // ─────────────────────────────────────────────────────────────────────────────
  const NegativeFilter = {
    /**
     * Kullanıcı panelinden girilen negatif köklerle eşleşirse reddeder.
     * Varsayılan boş → hiçbir şeyi engellemez.
     */
    shouldReject(rec) {
      if (!State.NEG_USER || State.NEG_USER.size === 0) return false;
      const txt = [rec.brand, rec.name, rec.title].filter(Boolean).join(" ");
      const toks = new Set(Lexicon.tokenize(txt));
      for (const t of toks) if (State.NEG_USER.has(t)) return true;
      return false;
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Matching & Campaign patterns
  // ─────────────────────────────────────────────────────────────────────────────
  const Match = (() => {
    const STOP_BASE = new Set(["unisex","set","paket","adet","renk","beden","boy","hediye","yeni","orijinal","urun","ürün","orjinal"]);
    let STOP_DYNAMIC = new Set();
    function setDynamicStop(s) { STOP_DYNAMIC = s || new Set(); }
    function isStop(tok) { return STOP_BASE.has(tok) || STOP_DYNAMIC.has(tok); }

    function tokenWeights(text) {
      const weights = new Map();
      const toks = Lexicon.tokenize(text || "");
      for (const tok of toks) {
        if (isStop(tok)) { weights.set(tok, (weights.get(tok) || 0) + 0.15); continue; }
        let w = tok.length <= 2 ? 0.5 : 1;
        if (Lexicon.has(tok)) w += 0.10;
        weights.set(tok, (weights.get(tok) || 0) + w);
      }
      return weights;
    }

    function wJaccard(A, B) {
      let inter = 0, uni = 0;
      const keys = new Set([...A.keys(), ...B.keys()]);
      for (const k of keys) {
        const a = A.get(k) || 0, b = B.get(k) || 0;
        inter += Math.min(a, b);
        uni += Math.max(a, b);
      }
      return uni ? inter / uni : 0;
    }

    function brandMatchScore(a, b) {
      const na = Lexicon.tokenize(a || "").join(" ");
      const nb = Lexicon.tokenize(b || "").join(" ");
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      const A = new Set(na.split(" ").filter(Boolean)),
            B = new Set(nb.split(" ").filter(Boolean));
      const inter = [...A].filter((x) => B.has(x)).length;
      const uni = new Set([...A, ...B]).size;
      return uni ? inter / uni : 0;
    }
    function jaroWinkler(a, b) {
      const s1 = Lexicon.tokenize(a || "").join(" ");
      const s2 = Lexicon.tokenize(b || "").join(" ");
      if (!s1 || !s2) return 0;
      const mDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
      let ma = [], mb = [], m = 0, t = 0;
      for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - mDist), end = Math.min(i + mDist + 1, s2.length);
        for (let j = start; j < end; j++) {
          if (mb[j]) continue;
          if (s1[i] === s2[j]) { ma[i] = 1; mb[j] = 1; m++; break; }
        }
      }
      if (m === 0) return 0;
      let k = 0;
      for (let i = 0; i < s1.length; i++) {
        if (ma[i]) {
          while (!mb[k]) k++;
          if (s1[i] !== s2[k]) t++;
          k++;
        }
      }
      t /= 2;
      const jaro = (m / s1.length + m / s2.length + (m - t) / m) / 3;
      let l = 0, maxL = 4;
      for (let i = 0; i < Math.min(maxL, s1.length, s2.length); i++) {
        if (s1[i] === s2[i]) l++; else break;
      }
      return jaro + l * 0.1 * (1 - jaro);
    }

    const PATS = (() => {
      const X="([1-9][0-9]?)", Y="([1-9][0-9]?)", TL="(?:t\\.?l\\.?|try)";
      const DOTQ='(?:\\.|’|"|\\\')?\\s*';
      const URUN="(?:urun|urune|urunu|urund[eui]?|urun[eui]|ürün|ürüne|ürünü)";
      const IK="(?:ikinci(?:si)?|2\\.?\\s*|2nci|2inci|2ci|2si|2\\s*\\.\\s*si|2\\s*si|2\\s*inci|2\\s*nci|2\\.?'?si?)";
      const reXalYode=new RegExp(`\\b${X}\\s*al\\s*${Y}\\s*(?:o\\s*de|ode|öde)\\b`);
      const reSecondOneTL=new RegExp(`\\b(?:${IK}${DOTQ}${URUN}\\s*|${IK}\\s*)(?:1\\s*${TL})\\b`);
      const reSecondPercent=new RegExp(`\\b(?:${IK}${DOTQ}${URUN}\\s*|${IK}\\s*)(?:%\\s*(\\d{1,3}))\\b`);
      const reTwoUnitsPercent=/\b2\s*adede?\s*%\s*(\d{1,3})\b/;
      const reSecondToTL=new RegExp(`\\b(?:${IK})(?:ye|ya)?\\s*(?:1\\s*${TL})\\b`);
      const reSecondToPercent=new RegExp(`\\b(?:${IK})(?:ye|ya)?\\s*%\\s*(\\d{1,3})\\b`);
      const reIkincisiBedava=new RegExp(`\\b(?:${IK}\\s*(?:${URUN})?\\s*)bedava\\b`);
      const reSepettePct=/\bsepette\s*(?:ek\s*)?%\s*(\d{1,3})\b/;
      const reSepetteTL=new RegExp(`\\bsepette\\s*(\\d{1,3}(?:[\\.\\s]\\d{3})*(?:,\\d+)?|\\d+(?:,\\d+)?)\\s*${TL}\\b`);
      const reKuponTL=new RegExp(`\\bkupon(?:la| ile)?\\s*(\\d{1,3}(?:[\\.\\s]\\d{3})*(?:,\\d+)?|\\d+(?:,\\d+)?)\\s*${TL}\\b`);
      const reKargoBedava=/\bkargo\s*bedava\b/;
      const reAnindaPct=/\baninda\s*(?:indirim\s*)?%\s*(\d{1,3})\b/;
      const reAnindaTL=new RegExp(`\\baninda\\s*(?:indirim\\s*)?(\\d{1,3}(?:[\\.\\s]\\d{3})*(?:,\\d+)?|\\d+(?:,\\d+)?)\\s*${TL}\\b`);
      return [
        { id:"x_al_y_ode",     re:reXalYode,        lab:(m)=>`${m[1]} Al ${m[2]} Öde`, type:"X Al Y Öde" },
        { id:"2_urun_1tl",     re:reSecondOneTL,    lab:()=> "2. Ürün 1 TL",          type:"2. Ürün 1 TL" },
        { id:"2_urun_pct",     re:reSecondPercent,  lab:(m)=>`2. Ürün %${m[1]}`,       type:"2. Ürün %" },
        { id:"2_adet_pct",     re:reTwoUnitsPercent,lab:(m)=>`2 Adede %${m[1]}`,       type:"2. Ürün %" },
        { id:"2ye_1tl",        re:reSecondToTL,     lab:()=> "2.’ye 1 TL",             type:"2. Ürün 1 TL" },
        { id:"2ye_pct",        re:reSecondToPercent,lab:(m)=>`2.’ye %${m[1]}`,         type:"2. Ürün %" },
        { id:"ikincisi_bedava",re:reIkincisiBedava, lab:()=> "2. Ürün Bedava",         type:"2. Ürün Bedava" },
        { id:"sepette_pct",    re:reSepettePct,     lab:(m)=>`Sepette %${m[1]}`,       type:"Sepette %" },
        { id:"sepette_tl",     re:reSepetteTL,      lab:(m)=>`Sepette ${m[1]} TL`,     type:"Sepette TL" },
        { id:"kupon_tl",       re:reKuponTL,        lab:(m)=>`Kuponla ${m[1]} TL`,     type:"Kupon TL" },
        { id:"kargo_free",     re:reKargoBedava,    lab:()=> "Kargo Bedava",           type:"Kargo Bedava" },
        { id:"aninda_pct",     re:reAnindaPct,      lab:(m)=>`Anında %${m[1]}`,        type:"Anında %" },
        { id:"aninda_tl",      re:reAnindaTL,       lab:(m)=>`Anında ${m[1]} TL`,      type:"Anında TL" },
      ];
    })();

    function resolveCampaignTypeAndLabel(campaigns) {
      const low = Util.normalizeText(campaigns.join(" | "));
      const m = low.match(/([1-9]\d?)\s*al\s*([1-9]\d?)\s*(?:o\s*de|ode|öde)\b/);
      if (m) return { type: "X Al Y Öde", label: `${m[1]} Al ${m[2]} Öde` };
      if (/2\.\s*ürün\s*1\s*tl|2\.’ye\s*1\s*tl/.test(low)) return { type: "2. Ürün 1 TL", label: "2. Ürün 1 TL" };
      if (/2\.\s*ürün\s*%|2\.’ye\s*%|2\s*adede\s*%/.test(low)) {
        const p = (low.match(/%\s*(\d{1,3})/) || [])[1];
        return { type: "2. Ürün %", label: p ? `2. Ürün %${p}` : "2. Ürün %" };
      }
      if (/2\.\s*ürün\s*bedava/.test(low)) return { type: "2. Ürün Bedava", label: "2. Ürün Bedava" };
      if (/sepette\s*%/.test(low)) {
        const p = (low.match(/%\s*(\d{1,3})/) || [])[1];
        return { type: "Sepette %", label: `Sepette %${p || ""}`.trim() };
      }
      if (/sepette\s*\d+\s*tl/.test(low)) {
        const v = (low.match(/(\d[\d\s\.]*,?\d*)\s*tl/) || [])[1];
        return { type: "Sepette TL", label: `Sepette ${v || ""} TL`.trim() };
      }
      if (/kuponla\s*\d+\s*tl/.test(low)) {
        const v = (low.match(/(\d[\d\s\.]*,?\d*)\s*tl/) || [])[1];
        return { type: "Kupon TL", label: `Kuponla ${v || ""} TL`.trim() };
      }
      if (/aninda\s*%\s*\d+/.test(low)) {
        const p = (low.match(/%\s*(\d{1,3})/) || [])[1];
        return { type: "Anında %", label: `Anında %${p || ""}`.trim() };
      }
      if (/aninda\s*\d+\s*tl/.test(low)) {
        const v = (low.match(/(\d[\d\s\.]*,?\d*)\s*tl/) || [])[1];
        return { type: "Anında TL", label: `Anında ${v || ""} TL`.trim() };
      }
      const first = campaigns[0] || "";
      return { type: first || "Sepette %", label: first || "Sepette %" };
    }

    function unitPriceByLabel(price, label) {
      if (price == null || !label) return null;
      const m = label.match(/(\d+)\s*Al\s*(\d+)\s*Öde/i);
      if (m) {
        const X = parseInt(m[1], 10), Y = parseInt(m[2], 10);
        if (X > 0 && Y > 0 && Y <= X) return Util.round2(price * (Y / X));
      }
      if (/2\.\s*Ürün\s*%/.test(label)) {
        const pm = label.match(/%(\d{1,3})/);
        if (pm) {
          const pct = parseInt(pm[1], 10);
          if (pct > 0 && pct < 100) {
            const total = price + price * (1 - pct / 100);
            return Util.round2(total / 2);
          }
        }
      }
      return null;
    }

    function bestMatch(rec, targets) {
      const A = tokenWeights([rec.brand, rec.name].filter(Boolean).join(" "));
      const productTokens = new Set([...A.keys()]);
      let best=null, bestScore=0, bestBrandSim=0, bestCatOverlap=0;

      for (const t of targets) {
        const tBrand=(t.brand||"").trim();
        const tName =(t.name ||"").trim();
        const tCat  =(t.category||"").trim();

        const tgtText=[tBrand,tBrand,tName].filter(Boolean).join(" ").trim() || t.raw || "";
        const B=tokenWeights(tgtText);

        let s=wJaccard(A,B);

        const aBrand=Lexicon.tokenize(rec.brand||"").join(" ");
        const bBrand=Lexicon.tokenize(tBrand||"").join(" ");
        const brandScore=brandMatchScore(aBrand,bBrand);
        const jw=jaroWinkler(aBrand,bBrand);
        const brandSim=Math.max(brandScore,jw);
        if (brandSim>=0.99) s+=0.18; else if (brandSim>=0.8) s+=0.10; else if (brandSim>=0.55) s+=0.03;

        let catBoost=0, catPenalty=0, overlap=0;
        if (tCat){
          const catTokens=new Set(Lexicon.tokenize(tCat).filter(x=>x.length>=2));
          overlap=[...catTokens].filter(x=>productTokens.has(x)).length;
          if (overlap>=2) catBoost=0.10;
          else if (overlap===1) catBoost=0.06;
          else if (brandSim<0.8) catPenalty=0.05;
        }
        s = Math.max(0, Math.min(1, s + catBoost - catPenalty));

        if (s>bestScore){
          bestScore = s;
          best = t;
          bestBrandSim = brandSim;
          bestCatOverlap = overlap||0;
        }
      }
      return { best, score:bestScore, brandSim:bestBrandSim, catOverlap:bestCatOverlap };
    }

    return { bestMatch, resolveCampaignTypeAndLabel, unitPriceByLabel, PATS, setDynamicStop };
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  // UI + Durum Çubuğu + Modal + NEG paneli
  // ─────────────────────────────────────────────────────────────────────────────
  const UI = {
    ensurePanel() {
      if (document.getElementById("brostagma-panel")) return;
      const panel = document.createElement("div");
      panel.id = "brostagma-panel";
      panel.innerHTML = `
        <div class="hdr" title="Sürükle ve taşı">
          <div class="title">Kampanya Tarayıcı</div>
          <div class="minirow">
            <label class="switch"><input id="brostagma-dc-enabled" type="checkbox"><span>DC</span></label>
            <label class="switch"><input id="brostagma-sim-enabled" type="checkbox"><span>Benzer</span></label>
            <button class="mini" title="Küçült/Aç">−</button>
          </div>
        </div>

        <div class="toolbar">
          <button class="btn xl primary" id="brostagma-export">Eşleşenleri İndir (.xlsx)</button>
        </div>

        <div class="content">
          <div class="section stats">
            <div class="stat"><div class="stat-num total">0</div><div class="stat-label">Toplam Kart</div></div>
            <div class="stat"><div class="stat-num count">0</div><div class="stat-label">Eşleşen</div></div>
          </div>

          <div class="section">
            <div class="row inline">
              <span>Adım</span><input id="brostagma-step" type="number" min="200" step="50" class="inp xs" />
              <span>Bekleme</span><input id="brostagma-delay" type="number" min="200" step="100" class="inp xs" />
              <button class="btn xs" id="brostagma-run">Başlat</button>
              <button class="btn xs neutral" id="brostagma-reset">Sıfırla</button>
              <span class="muted dcstat" id="brostagma-dc-stat">DC: —</span>
            </div>
            <div class="progress-wrap">
              <div class="progress-bar indeterminate" id="brostagma-progress"><span class="label" id="brostagma-progress-label">Hazır</span></div>
            </div>
          </div>

          <div class="section">
            <div class="fold-hdr" id="brostagma-filters-toggle"><span>Kampanya Tipleri</span><span class="chev">▼</span></div>
            <div class="filters is-open" id="brostagma-camp-filters"></div>
            <div class="row inline">
              <button class="btn xs sec" id="brostagma-all-on">Aç</button>
              <button class="btn xs neutral" id="brostagma-all-off">Kapat</button>
              <button class="btn xs" id="brostagma-save-filters">Kaydet</button>
            </div>
          </div>

          <div class="section">
            <div class="row">
              <label class="btn xs file">Hedef Liste (.xlsx)<input type="file" accept=".xlsx,.xls" style="display:none" id="brostagma-xlsx"/></label>
              <button class="btn s" id="brostagma-export-targets">Ayıklanan Hedefler (.xlsx)</button>
            </div>
            <div class="muted help">Okunan başlıklar: <b>Marka</b>, <b>Ürün</b>, <b>Kategori</b></div>
            <div class="muted report" id="brostagma-target-report">—</div>
          </div>

          <div class="section">
            <div class="row">
              <span style="font-weight:800">Negatif Anahtarlar</span>
              <input id="brostagma-neg-input" class="inp" placeholder="virgülle: tisort, havlu, ... (opsiyonel)" style="flex:1;min-width:180px"/>
              <button class="btn xs" id="brostagma-neg-save">Kaydet</button>
              <span class="muted" id="brostagma-neg-count">—</span>
            </div>
            <div class="muted help">Buraya eklediklerin <b>hariç tutulur</b>. Varsayılan boş kalırsa hiçbir ürün sırf kelime yüzünden elenmez.</div>
          </div>

          <div class="muted status">—</div>
        </div>

        <div id="brostagma-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="brostagma-modal-title">
          <div class="modal-box">
            <div class="modal-hdr">
              <div class="modal-title" id="brostagma-modal-title">Kesinleşmeyen Eşleşmeler</div>
              <button class="modal-close" id="brostagma-modal-close">✕</button>
            </div>
            <div class="modal-body">
              <div class="modal-desc">Aşağıdaki ürünler ikinci taramada aday olarak bulundu. Excel’e eklemek istediklerinizi seçin.</div>
              <div class="modal-actions-top">
                <button class="btn xs" id="brostagma-modal-selall">Tümünü Seç</button>
                <button class="btn xs neutral" id="brostagma-modal-selnone">Seçimi Temizle</button>
              </div>
              <div class="modal-list" id="brostagma-modal-list"></div>
            </div>
            <div class="modal-ftr">
              <button class="btn" id="brostagma-modal-cancel">İptal</button>
              <button class="btn primary" id="brostagma-modal-confirm">Seçilenleri Ekle & İndir</button>
            </div>
          </div>
        </div>
      `;
      panel.style.cssText = `
        position:fixed; right:12px; bottom:12px; z-index:${CFG.UI.Z};
        min-width:${CFG.UI.MIN_WIDTH}px; max-width:min(96vw,560px); color:#0b1220;
        background:#ffffffcc; backdrop-filter:saturate(1.25) blur(2px);
        border-radius:14px; box-shadow:0 10px 24px rgba(0,0,0,.18);
        font:12px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        max-height:80vh; overflow:auto; resize:both;`;

      document.body.appendChild(panel);

      GM_addStyle(`
        #brostagma-panel .hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(0,0,0,.08);cursor:move;background:linear-gradient(180deg,#22c55e,#16a34a);color:#ecfdf5}
        #brostagma-panel .title{font-weight:900;font-size:12px}
        #brostagma-panel .minirow{display:flex;align-items:center;gap:8px}
        #brostagma-panel .mini{background:#0b1220;color:#ecfdf5;border:none;border-radius:8px;padding:2px 8px;cursor:pointer;font-weight:900}
        #brostagma-panel .toolbar{padding:8px 10px;background:#f0fdf4;border-bottom:1px solid rgba(0,0,0,.06);display:flex;justify-content:center}
        #brostagma-panel .content{padding:8px 10px; display:flex; flex-direction:column; gap:8px;}
        #brostagma-panel .section{background:#f8fafc;border:1px solid rgba(0,0,0,.06);border-radius:10px;padding:8px}
        #brostagma-panel .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        #brostagma-panel .inp{width:96px;padding:6px;border-radius:8px;border:1px solid rgba(0,0,0,.15);background:#fff}
        #brostagma-panel .inp.xs{width:70px}
        #brostagma-panel .btn{background:#0b1220;color:#ecfdf5;border:none;border-radius:9px;padding:6px 10px;cursor:pointer;font-weight:800}
        #brostagma-panel .btn.primary{background:#0ea5e9}
        #brostagma-panel .btn.s{padding:6px 10px} .btn.xs{padding:4px 8px}
        #brostagma-panel .btn.sec{background:#0ea5e9}
        #brostagma-panel .btn.neutral{background:#64748b}
        #brostagma-panel .stat{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:88px;background:#fff;border-radius:8px;padding:6px;border:1px solid rgba(0,0,0,.06)}
        #brostagma-panel .stat-num{font-size:16px;font-weight:900}
        #brostagma-panel .stat-label{opacity:.8;font-weight:700;font-size:11px}
        #brostagma-panel .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
        #brostagma-panel .filters{display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:6px;margin-top:6px}
        #brostagma-panel .filters.is-open{display:grid} #brostagma-panel .filters:not(.is-open){display:none}
        #brostagma-panel .chip{display:flex;gap:6px;align-items:center;background:#ffffff;border:1px solid rgba(0,0,0,.08);border-radius:8px;padding:6px}
        #brostagma-panel .chip input{transform:scale(1.1)}
        #brostagma-panel .muted{opacity:.8}
        #brostagma-panel .help{margin-top:6px}
        #brostagma-panel .switch{display:inline-flex;align-items:center;gap:4px}
        #brostagma-panel .fold-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;background:#00000008;border:1px solid rgba(0,0,0,.06);padding:6px 8px;border-radius:8px;font-weight:900}
        #brostagma-panel .chev{font-weight:900}
        #brostagma-panel.collapsed .content, #brostagma-panel.collapsed .toolbar{display:none}
        .progress-wrap{margin-top:6px;background:#e2e8f0;border-radius:8px;overflow:hidden;border:1px solid rgba(0,0,0,.06)}
        .progress-bar{height:10px; width:0%; background:#22c55e; position:relative; transition:width .25s ease}
        .progress-bar .label{position:absolute;left:8px;top:-20px;font-weight:800;color:#0b1220;opacity:.9}
        .progress-bar.indeterminate{width:100%; background:linear-gradient(90deg, rgba(34,197,94,0.35) 25%, rgba(34,197,94,0.9) 50%, rgba(34,197,94,0.35) 75%); background-size:200% 100%; animation:brostagma-prog 1.4s linear infinite}
        @keyframes brostagma-prog { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
        /* Modal */
        #brostagma-modal.modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:${CFG.UI.Z+1}}
        #brostagma-modal.hidden{display:none}
        #brostagma-modal .modal-box{width:min(92vw,720px);max-height:80vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 40px rgba(0,0,0,.25);padding:10px;border:1px solid rgba(0,0,0,.08)}
        .modal-hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,.06);padding:8px}
        .modal-title{font-weight:900}
        .modal-close{background:#0b1220;color:#ecfdf5;border:none;border-radius:8px;padding:2px 8px;cursor:pointer}
        .modal-body{padding:8px;display:flex;flex-direction:column;gap:8px}
        .modal-desc{opacity:.9}
        .modal-actions-top{display:flex;gap:8px}
        .modal-list{display:flex;flex-direction:column;gap:8px}
        .modal-item{border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:8px;background:#f8fafc;display:grid;grid-template-columns:24px 1fr;gap:8px}
        .modal-item .tt{font-weight:800}
        .modal-item .meta{opacity:.8;font-size:11px}
        .modal-ftr{display:flex;justify-content:flex-end;gap:8px;padding:8px;border-top:1px solid rgba(0,0,0,.06)}
        @media (max-width: 480px){
          #brostagma-panel{left:8px; right:8px; bottom:8px; min-width:unset}
          #brostagma-panel .filters{grid-template-columns:1fr}
          #brostagma-modal .modal-box{width:96vw}
        }
      `);

      State.ui = {
        root: panel,
        status: panel.querySelector(".status"),
        total: panel.querySelector(".total"),
        count: panel.querySelector(".count"),

        miniBtn: panel.querySelector(".mini"),
        runBtn: panel.querySelector("#brostagma-run"),
        btnReset: panel.querySelector("#brostagma-reset"),
        btnExport: panel.querySelector("#brostagma-export"),
        btnExportTargets: panel.querySelector("#brostagma-export-targets"),
        fileXlsx: panel.querySelector("#brostagma-xlsx"),

        inputStep: panel.querySelector("#brostagma-step"),
        inputDelay: panel.querySelector("#brostagma-delay"),

        filtersHost: panel.querySelector("#brostagma-camp-filters"),
        btnAllOn: panel.querySelector("#brostagma-all-on"),
        btnAllOff: panel.querySelector("#brostagma-all-off"),
        btnSaveFilters: panel.querySelector("#brostagma-save-filters"),
        foldFilters: panel.querySelector("#brostagma-filters-toggle"),

        dcEnabled: panel.querySelector("#brostagma-dc-enabled"),
        simEnabled: panel.querySelector("#brostagma-sim-enabled"),
        dcStat: panel.querySelector("#brostagma-dc-stat"),
        targetReport: panel.querySelector("#brostagma-target-report"),

        progressBar: panel.querySelector("#brostagma-progress"),
        progressLabel: panel.querySelector("#brostagma-progress-label"),

        // NEG panel
        negInput: panel.querySelector("#brostagma-neg-input"),
        negSave: panel.querySelector("#brostagma-neg-save"),
        negCount: panel.querySelector("#brostagma-neg-count"),

        // Modal
        modal: panel.querySelector("#brostagma-modal"),
        modalClose: panel.querySelector("#brostagma-modal-close"),
        modalList: panel.querySelector("#brostagma-modal-list"),
        modalSelAll: panel.querySelector("#brostagma-modal-selall"),
        modalSelNone: panel.querySelector("#brostagma-modal-selnone"),
        modalCancel: panel.querySelector("#brostagma-modal-cancel"),
        modalConfirm: panel.querySelector("#brostagma-modal-confirm"),
      };

      State.ui.inputStep.value = String(State.SCROLL_STEP);
      State.ui.inputDelay.value = String(State.SCROLL_DELAY);
      State.ui.dcEnabled.checked = !!State.DC_ENABLED;
      State.ui.simEnabled.checked = !!State.ALLOW_SIMILAR;

      // NEG panel init
      UI.renderNegatives();

      State.ui.miniBtn.onclick = () => {
        const c = !State.ui.root.classList.contains("collapsed");
        State.ui.root.classList.toggle("collapsed", c);
        State.ui.miniBtn.textContent = c ? "+" : "−";
        GM_setValue(CFG.PREF.PANEL_COLLAPSE, c);
      };
      if (GM_getValue(CFG.PREF.PANEL_COLLAPSE, false)) {
        State.ui.root.classList.add("collapsed");
        State.ui.miniBtn.textContent = "+";
      }
      UI.makeDraggablePanel(State.ui.root);

      State.ui.runBtn.onclick = () => {
        if (State.autoTimer) { Observers.stopAutoScroll(); UI.setRunState(false); UI.setProgressIdle(); }
        else { Observers.startAutoScroll(); UI.setRunState(true); UI.setProgressIndeterminate("Tarama sürüyor…"); }
      };
      State.ui.btnReset.onclick = () => {
        Observers.stopAutoScroll();
        UI.setRunState(false);
        App.softRestart();
        UI.setProgressIdle();
      };

      // Export akışı
      State.ui.btnExport.onclick = async () => {
        try {
          await QuickScan.runAndConfirmThenExport();
        } catch (e) {
          alert("Dışa aktarma sırasında bir hata oluştu: " + (e?.message || e));
          UI.setProgressIdle();
        }
      };

      State.ui.btnExportTargets.onclick = ExportXLSX.exportTargets;
      State.ui.fileXlsx.onchange = Targets.importTargetsFromXlsx;

      State.ui.btnAllOn.onclick = () => { State.enabledCampaignTypes = new Set(CFG.CAMPAIGN_TYPES); UI.renderCampaignFilters(); };
      State.ui.btnAllOff.onclick = () => { State.enabledCampaignTypes = new Set(); UI.renderCampaignFilters(); };
      State.ui.btnSaveFilters.onclick = () => {
        GM_setValue(CFG.PREF.CAMP_FILTERS, [...State.enabledCampaignTypes]);
        alert("Filtreler kaydedildi.");
      };
      State.ui.dcEnabled.onchange = () => {
        State.DC_ENABLED = !!State.ui.dcEnabled.checked;
        GM_setValue(CFG.PREF.DC_ENABLED, State.DC_ENABLED);
        UI.refreshStatus();
      };
      State.ui.simEnabled.onchange = () => {
        State.ALLOW_SIMILAR = !!State.ui.simEnabled.checked;
        GM_setValue(CFG.PREF.ALLOW_SIMILAR, State.ALLOW_SIMILAR);
      };

      // NEG events
      State.ui.negSave.onclick = () => {
        const raw = String(State.ui.negInput.value || "");
        const items = raw.split(",").map((x) => x.trim()).filter(Boolean)
          .map((x) => Lexicon.normalizeRoot(x)).filter(Boolean);
        State.NEG_USER = new Set(items);
        GM_setValue(CFG.PREF.NEG_USER, [...State.NEG_USER]);
        UI.renderNegatives();
        alert("Negatif anahtarlar kaydedildi.");
      };

      const toggleFold = (hdr, bodySel) =>
        hdr?.addEventListener("click", () => {
          const body = hdr.parentElement.querySelector(bodySel);
          if (!body) return;
          const open = body.classList.toggle("is-open");
          hdr.querySelector(".chev").textContent = open ? "▼" : "▲";
        });
      toggleFold(State.ui.foldFilters, ".filters");

      // Modal events
      State.ui.modalClose.onclick = UI.hideModal;
      State.ui.modalCancel.onclick = UI.hideModal;
      State.ui.modalSelAll.onclick = () => UI.modalSelectAll(true);
      State.ui.modalSelNone.onclick = () => UI.modalSelectAll(false);
      State.ui.modalConfirm.onclick = () => {
        const selected = [];
        State.ui.modalList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
          if (cb.checked) {
            const key = cb.getAttribute("data-key");
            if (key && State.catalog.has(key)) selected.push(State.catalog.get(key));
          }
        });
        UI.hideModal();
        QuickScan.commitSelectedAndExport(selected);
      };

      UI.renderCampaignFilters();
      UI.refreshStatus();
      UI.updateCounters();
      UI.setProgressIdle();
    },

    renderNegatives() {
      if (!State.ui) return;
      State.ui.negInput.value = [...State.NEG_USER].join(", ");
      State.ui.negCount.textContent = `Aktif: ${State.NEG_USER.size}`;
    },

    setRunState(running) {
      if (!State.ui) return;
      State.ui.runBtn.classList.toggle("running", !!running);
      State.ui.runBtn.textContent = running ? "Durdur" : "Başlat";
    },

    setProgressIndeterminate(label) {
      if (!State.ui) return;
      State.ui.progressBar.classList.add("indeterminate");
      State.ui.progressBar.style.width = "100%";
      State.ui.progressLabel.textContent = label || "Çalışıyor…";
    },
    setProgress(value, total, label) {
      if (!State.ui) return;
      State.ui.progressBar.classList.remove("indeterminate");
      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
      State.ui.progressBar.style.width = Math.min(100, Math.max(0, pct)) + "%";
      State.ui.progressLabel.textContent = label || `${pct}%`;
    },
    setProgressIdle() {
      if (!State.ui) return;
      State.ui.progressBar.classList.remove("indeterminate");
      State.ui.progressBar.style.width = "0%";
      State.ui.progressLabel.textContent = "Hazır";
    },

    renderCampaignFilters() {
      const host = State.ui.filtersHost; if (!host) return;
      host.innerHTML = "";
      for (const t of CFG.CAMPAIGN_TYPES) {
        if (t === "Kargo Bedava") continue;
        const id = "camp-" + t.replace(/\W+/g, "_");
        const wrap = document.createElement("label");
        wrap.className = "chip";
        wrap.innerHTML = `<input type="checkbox" id="${id}"><span>${Util.escapeHtml(t)}</span>`;
        const cb = wrap.querySelector("input");
        cb.checked = State.enabledCampaignTypes.has(t);
        cb.onchange = () => {
          if (cb.checked) State.enabledCampaignTypes.add(t);
          else State.enabledCampaignTypes.delete(t);
          UI.refreshStatus();
        };
        host.appendChild(wrap);
      }
    },

    makeDraggablePanel(el) {
      const pos = GM_getValue(CFG.PREF.PANEL_POS, null);
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        el.style.bottom = "unset"; el.style.right = "unset";
        el.style.left = pos.x + "px"; el.style.top = pos.y + "px";
      }
      const hdr = el.querySelector(".hdr");
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      hdr.addEventListener("mousedown", (e) => {
        dragging = true; sx = e.clientX; sy = e.clientY;
        const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const nx = Math.max(4, ox + (e.clientX - sx));
        const ny = Math.max(4, oy + (e.clientY - sy));
        el.style.left = nx + "px"; el.style.top = ny + "px";
        el.style.bottom = "unset"; el.style.right = "unset";
      });
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        const r = el.getBoundingClientRect();
        GM_setValue(CFG.PREF.PANEL_POS, { x: Math.max(0, r.left), y: Math.max(0, r.top) });
      });
    },

    refreshStatus() {
      if (!State.ui) return;
      const withCat = State.TARGETS.filter((t) => t.category).length;
      State.ui.status.textContent =
        `Hedef: ${State.TARGETS.length} (Kategori'li: ${withCat}) • Eşik: yok • Benzer: ${State.ALLOW_SIMILAR ? "Açık" : "Kapalı"} • NEG: ${State.NEG_USER.size}`;
      const dcTxt = State.DC_ENABLED ? `Açık | Kuyruk ${State.dcQueue.length} | Aktif ${State.inFlight}` : "Kapalı";
      State.ui.dcStat.textContent = `DC: ${dcTxt}`;
      const r = State.lastParsedReport;
      State.ui.targetReport.textContent =
        r && (r.brandCount || r.nameCount || r.categoryCount)
          ? `Ayıklanan: Marka ${r.brandCount} • Ürün ${r.nameCount} • Kategori ${r.categoryCount}`
          : "—";
    },

    updateCounters() {
      if (!State.ui) return;
      State.ui.total.textContent = String(State.totalCardKeys.size);
      State.ui.count.textContent = String(State.matchedList.length);
    },

    showModal(items) {
      if (!State.ui) return;
      State.ui.modalList.innerHTML = "";
      for (const rec of items) {
        const id = `brostagma-cand-${rec.key}`;
        const el = document.createElement("label");
        el.className = "modal-item";
        el.innerHTML = `
          <input type="checkbox" data-key="${Util.escapeHtml(rec.key)}" id="${id}"/>
          <div>
            <div class="tt">${Util.escapeHtml(rec.brand || "")} ${Util.escapeHtml(rec.name || rec.title || "")}</div>
            <div class="meta">
              Skor: ${(rec.score != null ? Math.round(rec.score*100) : 0)} • MarkaBenzer: ${Math.round((rec.brandSim||0)*100)} • KatTok: ${rec.catOverlap||0}
              • Kampanya: ${Util.escapeHtml(rec.kampLabel || rec.kampTipi || (rec.campaigns?.[0] || ""))}
              • <a href="${rec.href}" target="_blank" rel="noreferrer">Ürün</a>
            </div>
          </div>
        `;
        State.ui.modalList.appendChild(el);
      }
      State.ui.modal.classList.remove("hidden");
    },
    hideModal() { if (State.ui) State.ui.modal.classList.add("hidden"); },
    modalSelectAll(checked) { if (State.ui) State.ui.modalList.querySelectorAll("input[type='checkbox']").forEach((cb) => { cb.checked = !!checked; }); },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Observers & Auto-scroll
  // ─────────────────────────────────────────────────────────────────────────────
  const Observers = {
    async startAutoScroll() {
      Observers.stopAutoScroll();
      State.SCROLL_STEP = Math.max(200, parseInt(State.ui?.inputStep.value || `${CFG.DEF.STEP}`, 10));
      State.SCROLL_DELAY = Math.max(200, parseInt(State.ui?.inputDelay.value || `${CFG.DEF.DELAY}`, 10));
      GM_setValue(CFG.PREF.STEP, State.SCROLL_STEP);
      GM_setValue(CFG.PREF.DELAY, State.SCROLL_DELAY);

      let running = true, rafId = 0;
      State.autoTimer = { stop: () => { running = false; cancelAnimationFrame(rafId); } };

      while (running) {
        await animateScrollBy(State.SCROLL_STEP, State.SCROLL_DELAY, (id) => { rafId = id; }, () => running);
        Observers.registerCards(State.gridRoot || document.body);
        if (isAtScrollEnd()) {
          await Util.sleep(200);
          doScrollBy(1);
        }
      }

      function animateScrollBy(distance, duration, setRafId, isRunning) {
        return new Promise((resolve) => {
          const startY = getScrollTop(), targetY = startY + distance, start = performance.now();
          let lastPos = startY;
          function step(now) {
            if (!isRunning()) return resolve();
            const t = Math.min(1, (now - start) / duration);
            const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
            const pos = startY + (targetY - startY) * eased;
            const delta = pos - lastPos;
            if (Math.abs(delta) >= 0.5) doScrollBy(delta);
            lastPos = pos;
            if (t < 1) setRafId(requestAnimationFrame(step)); else resolve();
          }
          setRafId(requestAnimationFrame(step));
        });
      }
      function getScrollTop(){ return State.scrollRoot ? State.scrollRoot.scrollTop : window.scrollY; }
      function getScrollHeight(){ return State.scrollRoot ? State.scrollRoot.scrollHeight : document.body.offsetHeight; }
      function getClientHeight(){ return State.scrollRoot ? State.scrollRoot.clientHeight : window.innerHeight; }
      function isAtScrollEnd(){ return getClientHeight() + getScrollTop() >= getScrollHeight() - 4; }
      function doScrollBy(y){ if (State.scrollRoot) State.scrollRoot.scrollTop += y; else window.scrollBy(0, y); }
    },
    stopAutoScroll() { if (State.autoTimer) { State.autoTimer.stop?.(); State.autoTimer = null; } },
    detectRootsAndObserve() {
      State.scrollRoot = pickScrollRoot();
      const nextRoot = document.querySelector(CFG.SELECTOR.GRID_CANDIDATE) || document.documentElement;

      for (const obs of ["gridMutationObserver", "globalMutationObserver", "cardObserver"]) {
        if (State[obs]) { try { State[obs].disconnect(); } catch {} State[obs] = null; }
      }
      State.gridRoot = nextRoot;

      State.gridMutationObserver = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) if (n instanceof HTMLElement) Observers.registerCards(n);
          for (const n of m.removedNodes) if (n instanceof HTMLElement) Observers.cleanupCards(n);
        }
        if (document.body && !document.getElementById("brostagma-panel")) UI.ensurePanel();
      });
      State.gridMutationObserver.observe(State.gridRoot, { childList: true, subtree: true });

      State.globalMutationObserver = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) if (n instanceof HTMLElement) Observers.registerCards(n);
          for (const n of m.removedNodes) if (n instanceof HTMLElement) Observers.cleanupCards(n);
        }
      });
      State.globalMutationObserver.observe(document.documentElement, { childList: true, subtree: true });

      const rootEl = State.scrollRoot || null;
      const vh = Math.max(500, Math.min(1800, Math.round(((rootEl ? rootEl.clientHeight : window.innerHeight) || 700) * 1.2)));
      State.cardObserver = new IntersectionObserver(
        (entries) => { entries.forEach((e) => { if (e.isIntersecting) Scan.processVisibleCard(e.target); }); },
        { root: rootEl, rootMargin: `${vh}px 0px ${vh}px 0px`, threshold: 0 }
      );

      const target = State.scrollRoot || window;
      if (State.scrollListenerTarget && State.scrollListenerTarget !== target) {
        try { State.scrollListenerTarget.removeEventListener("scroll", Observers._onScrollPassive, { passive: true }); } catch {}
      }
      target.addEventListener("scroll", Observers._onScrollPassive, { passive: true });
      State.scrollListenerTarget = target;

      function pickScrollRoot() {
        const c = document.querySelector(CFG.SELECTOR.GRID_CANDIDATE);
        if (!c) return null;
        const st = getComputedStyle(c).overflowY;
        return /auto|scroll/i.test(st) ? c : null;
      }
    },
    registerCards(root) {
      if (!root || !State.cardObserver) return;
      root.querySelectorAll(CFG.SELECTOR.CARD).forEach((el) => {
        const link = el.querySelector(CFG.SELECTOR.LINK);
        const href = link ? link.getAttribute("href") || "" : "";
        const key = href ? Util.canonicalKey(href) : null;
        if (key) State.totalCardKeys.add(key);
        if (!State.observedCards.has(el)) {
          try { State.cardObserver.observe(el); State.observedCards.add(el); } catch {}
        }
      });
      UI.updateCounters();
      UI.setProgressIndeterminate("Tarama sürüyor…");
    },
    cleanupCards(root) {
      if (!root) return;
      root.querySelectorAll(CFG.SELECTOR.CARD).forEach((el) => {
        try { State.cardObserver && State.cardObserver.unobserve(el); } catch {}
        State.observedCards.delete(el);
        Scan.cleanupRechecks(el);
      });
    },
    _onScrollPassive: Util.debounce(() => Observers.registerCards(State.gridRoot || document.body), 200),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Scan + DC
  // ─────────────────────────────────────────────────────────────────────────────
  const Scan = {
    processVisibleCard(card) {
      if (card.__brostagmaProcessing) return;
      card.__brostagmaProcessing = true;
      try {
        const linkEl = Scan.findProductLink(card);
        if (!linkEl) { card.__brostagmaProcessing = false; return; }
        const href = linkEl.getAttribute("href") || "";
        if (!href || /\/sr(\?|$)/i.test(href)) { card.__brostagmaProcessing = false; return; }
        const key = Util.canonicalKey(href);
        if (!key) { card.__brostagmaProcessing = false; return; }

        const titleEl =
          card.querySelector("h3[data-testid*='product-title'], h3.prdct-desc-cntnr-ttl-w, h3") ||
          card.querySelector(".prdct-desc-cntnr-name") || card;
        const title = Util.norm(titleEl?.innerText || "").slice(0, 300);
        const { brand, name } = extractBrandAndShortName(card, title);
        const price = Scan.pickPrice(card);

        const detected = Scan.detectCampaigns(card);
        let label = null, type = null;
        if (detected.length) {
          const r = Match.resolveCampaignTypeAndLabel(detected);
          type = r.type; label = r.label;
        }

        const bm = Match.bestMatch({ title, brand, name }, State.TARGETS);
        const brandSim = bm.brandSim || 0;
        const catOverlap = bm.catOverlap || 0;

        const passScore = !State.TARGETS.length || (brandSim >= 0.60 || catOverlap >= 1);

        const rec = {
          key, title, brand, name, price, href: Util.absolute(href),
          campaigns: detected, kampTipi: type, kampLabel: label,
          birim: Match.unitPriceByLabel(price, label),
          bestTargetId: bm.best?.__id ?? null,
          score: bm.score, brandSim: bm.brandSim, catOverlap: bm.catOverlap,
        };

        // KATALOG
        Catalog.add(rec);

        // Negatif filtre (yalnızca kullanıcı girdisi)
        const rejectByNegative = NegativeFilter.shouldReject(rec);

        // Kart üstü kesin eşleşme
        if (!rejectByNegative && detected.length && type && State.enabledCampaignTypes.has(type) && type !== "Kargo Bedava" && passScore) {
          Scan.finalizeRecord(rec);
          Scan.cleanupRechecks(card);
          return;
        }

        if (State.DC_ENABLED && passScore && !rejectByNegative) {
          DeepCampaign.enqueue({ key, url: rec.href, hint: { title, brand, name, price }, card });
        } else {
          if (!State.recheckFlags.get(card)?.scheduled) Scan.scheduleRechecks(card);
        }
      } catch (e) {
        Util.log("processVisibleCard err", e);
      } finally {
        card.__brostagmaProcessing = false;
        State.processedCount++;
        UI.updateCounters();
      }
    },

    finalizeRecord(rec) {
      if (!State.catalog.has(rec.key)) Catalog.add(rec);
      if (State.matchedList.find((r) => r.key === rec.key)) return;

      if (NegativeFilter.shouldReject(rec)) return;

      if (State.enabledCampaignTypes.has(rec.kampTipi) && rec.kampTipi !== "Kargo Bedava") {
        State.matchedList.push(rec);
        UI.updateCounters();
      }
    },

    findProductLink(card) {
      return (
        card.querySelector(CFG.SELECTOR.LINK) ||
        (card.tagName === "A" && /\/p\/|\-p\-\d+/.test(card.getAttribute("href") || "") ? card : null)
      );
    },

    scheduleRechecks(card) {
      const flags = { scheduled: true, attempts: 0 };
      State.recheckFlags.set(card, flags);
      try {
        const mo = new MutationObserver(() => setTimeout(() => Scan.processVisibleCard(card), 0));
        mo.observe(card, { subtree: true, childList: true, characterData: true });
        State.recheckObservers.set(card, mo);
        const killer = setTimeout(() => { try { mo.disconnect(); } catch {} }, 3000);
        State.recheckTimers.set(card, { timers: [killer] });
      } catch {}
      const plan = [500, 1200, 2600];
      plan.forEach((ms) => {
        const id = setTimeout(() => {
          const f = State.recheckFlags.get(card);
          if (!f || !f.scheduled) return;
          f.attempts++;
          Scan.processVisibleCard(card);
          if (f.attempts >= plan.length) { f.scheduled = false; }
        }, ms);
        let timersObj = State.recheckTimers.get(card);
        if (!timersObj) { timersObj = { timers: [] }; State.recheckTimers.set(card, timersObj); }
        timersObj.timers.push(id);
      });
    },

    cleanupRechecks(card) {
      const mo = State.recheckObservers.get(card);
      if (mo) { try { mo.disconnect(); } catch {} State.recheckObservers.delete(card); }
      const ts = State.recheckTimers.get(card);
      if (ts?.timers) { ts.timers.forEach(clearTimeout); State.recheckTimers.delete(card); }
      const f = State.recheckFlags.get(card);
      if (f) { f.scheduled = false; State.recheckFlags.delete(card); }
    },

    detectCampaigns(card) {
      const tags = new Set();
      const put = (raw) => {
        const t = Util.norm(raw || "");
        if (!t) return;
        const lowN = Util.normalizeText(t);
        for (const { re, lab } of Match.PATS) {
          const m = lowN.match(re);
          if (m) tags.add(lab(m));
        }
      };
      card.querySelectorAll(".product-badge, .badges-wrapper .product-badge, [class*='badge']").forEach((el) => put(el.textContent));
      if (!tags.size) {
        card.querySelectorAll("[data-testid],[title],[aria-label],button,a,div,span").forEach((el) => {
          put(el.textContent);
          put(el.getAttribute("title"));
          put(el.getAttribute("aria-label"));
          put(el.getAttribute("data-testid"));
        });
      }
      return [...tags];
    },

    pickPrice(card) {
      const v2 = card.querySelector(
        ".price-container-v2 .price-information-container, div[class*='price-container-v2'] .price-information-container"
      );
      if (v2) {
        const v = Util.parsePrice(Util.norm(v2.textContent));
        if (v != null) return v;
      }
      const bestSel = [".prc-box-dscntd", '[data-testid="price-current-price"]', ".prc-box-orgnl"];
      for (const s of bestSel) {
        const el = card.querySelector(s);
        if (el) {
          const v = Util.parsePrice(Util.norm(el.textContent));
          if (v != null) return v;
        }
      }
      const nums = (Util.norm(card.textContent || "").match(/\d{1,3}(?:[\.\s]\d{3})*(?:,\d+)?|\d+(?:,\\d+)?/g) || [])
        .map((x) => parseFloat(x.replace(/\./g, "").replace(",", ".")).valueOf())
        .filter((n) => Number.isFinite(n) && n >= 5);
      return nums.length ? nums[nums.length - 1] : null;
    },
  };

  const Catalog = {
    add(rec) {
      if (!rec || !rec.key) return;
      if (!State.catalog.has(rec.key)) {
        State.catalog.set(rec.key, rec);
        State.keyOrder.push(rec.key);
        if (State.keyOrder.length > State.MAX_SCANNED_KEEP) {
          const drop = State.keyOrder.shift();
          State.catalog.delete(drop);
        }
      } else {
        const old = State.catalog.get(rec.key) || {};
        const merged = { ...old, ...rec };
        State.catalog.set(rec.key, merged);
      }
    },
    values() { return [...State.catalog.values()]; },
  };

  const DeepCampaign = {
    enqueue(job) {
      if (!State.DC_ENABLED) return;
      if (Date.now() < State.cooldownUntil) return;
      if (State.catalog.has(job.key) && State.catalog.get(job.key)?.kampTipi) return;
      State.dcQueue.push(job);
      UI.refreshStatus();
      DeepCampaign.pump();
    },
    pump() {
      if (!State.DC_ENABLED) return;
      if (Date.now() < State.cooldownUntil) return;
      while (State.inFlight < CFG.DC.CONCURRENCY && State.dcQueue.length) {
        const job = State.dcQueue.shift();
        DeepCampaign._run(job);
      }
      UI.refreshStatus();
    },
    async _run({ key, url, hint, card }) {
      State.inFlight++;
      UI.refreshStatus();
      const ctl = new AbortController();
      State.aborters.set(key, ctl);
      try {
        await Util.sleep(Util.jitter(CFG.DC.DELAY_MIN_MS, CFG.DC.DELAY_MAX_MS));
        const resp = await fetch(url, { credentials: "include", cache: "force-cache", signal: ctl.signal });
        if (resp.status === 429) {
          const ra = parseInt(resp.headers.get("Retry-After") || "0", 10);
          State.cooldownUntil = Date.now() + (isFinite(ra) && ra > 0 ? ra * 1000 : CFG.DC.COOLDOWN_MS);
          return;
        }
        if (!resp.ok) return;
        const text = await resp.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const promos = [];
        doc.querySelectorAll('[data-testid="promotion-box-item"], [data-testid="promotion-title"], [data-testid*="promotion"]').forEach((el) =>
          promos.push(Util.norm(el.textContent || ""))
        );
        doc.querySelectorAll(".product-promotions-wrapper, [class*='promotion-box']").forEach((el) =>
          promos.push(Util.norm(el.textContent || ""))
        );

        const found = new Set();
        for (const raw of promos) {
          const lowN = Util.normalizeText(raw);
          for (const { re, lab } of Match.PATS) {
            const m = lowN.match(re);
            if (m) found.add(lab(m));
          }
        }
        if (!found.size) {
          const low = Util.normalizeText(text.slice(0, 120000));
          for (const { re, lab } of Match.PATS) {
            const m = low.match(re);
            if (m) found.add(lab(m));
          }
        }
        if (!found.size) return;

        const campaigns = [...found];
        const { type, label } = Match.resolveCampaignTypeAndLabel(campaigns);
        if (!State.enabledCampaignTypes.has(type) || type === "Kargo Bedava") return;

        const bm = Match.bestMatch({ title: hint.title, brand: hint.brand, name: hint.name }, State.TARGETS);
        const passScore = !State.TARGETS.length || (bm.brandSim >= 0.60 || (bm.catOverlap || 0) >= 1);
        if (!passScore) return;

        const rec = {
          key, title: hint.title, brand: hint.brand, name: hint.name, price: hint.price,
          href: url, campaigns, kampTipi: type, kampLabel: label,
          birim: Match.unitPriceByLabel(hint.price, label), bestTargetId: bm.best?.__id ?? null,
          score: bm.score, brandSim: bm.brandSim, catOverlap: bm.catOverlap,
        };

        if (NegativeFilter.shouldReject(rec)) return;

        Catalog.add(rec);
        Scan.finalizeRecord(rec);
        Scan.cleanupRechecks(card);
      } catch {
        /* sessiz */
      } finally {
        State.inFlight--;
        State.aborters.delete(key);
        UI.refreshStatus();
        DeepCampaign.pump();
      }
    },
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      for (const [, ctl] of State.aborters) try { ctl.abort(); } catch {}
      State.inFlight = 0;
    } else {
      DeepCampaign.pump();
    }
  });

  function extractBrandAndShortName(card, title) {
    const ttl = Util.norm(title || "");
    const brandSel = [
      '[data-testid="brand-name"]',
      "a[data-testid*='brand']",
      ".prdct-desc-cntnr-ttl",
      ".prdct-desc-cntnr-ttl-w",
      "[class*='brand']",
      "a[class*='brand']",
      "span[class*='brand']",
    ];
    const cands = new Set();
    for (const sel of brandSel) {
      card.querySelectorAll(sel).forEach((el) => {
        const t = Util.norm(el.textContent || "");
        if (t && t.length <= 40) cands.add(t);
      });
    }
    let brand = "";
    const arr = [...cands].sort((a, b) => b.length - a.length);
    for (const b of arr) {
      if (ttl.toLowerCase().startsWith(b.toLowerCase() + " ") || ttl.toLowerCase() === b.toLowerCase()) {
        brand = b; break;
      }
    }
    if (!brand && arr.length) brand = arr[0];
    let name = ttl;
    if (brand) {
      const rx = new RegExp("^\\s*" + brand.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\s*", "i");
      name = ttl.replace(rx, "").trim().replace(/^[-–|•:\.]\s*/, "").trim();
    }
    return { brand: brand || "", name: name || ttl };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Quick Scan + Modal + Export
  // ─────────────────────────────────────────────────────────────────────────────
  const QuickScan = {
    async runAndConfirmThenExport() {
      if (!State.TARGETS.length || !State.catalog.size) {
        UI.setProgressIndeterminate("Excel hazırlanıyor… Lütfen bekleyin");
        ExportXLSX.exportMatches();
        setTimeout(() => UI.setProgressIdle(), 600);
        return;
      }

      UI.setProgressIndeterminate("İkinci tarama (kaçanlar) başlıyor…");

      const matchedTargetIds = new Set(State.matchedList.map((m) => m.bestTargetId).filter((x) => x != null));
      const cards = Catalog.values().filter((c) => c && c.href && c.key);
      const candidates = [];

      const domCampaignRefresh = (cardRec) => {
        if (cardRec.campaigns && cardRec.campaigns.length) return cardRec;
        const sel = `${CFG.SELECTOR.CARD} a[href*="${cardRec.key}"]`;
        const anchor = document.querySelector(sel);
        if (anchor) {
          const card = anchor.closest(CFG.SELECTOR.CARD);
          if (card) {
            const found = Scan.detectCampaigns(card);
            if (found.length) {
              const r = Match.resolveCampaignTypeAndLabel(found);
              cardRec.campaigns = found;
              cardRec.kampTipi = r.type;
              cardRec.kampLabel = r.label;
              cardRec.birim = Match.unitPriceByLabel(cardRec.price, r.label);
              Catalog.add(cardRec);
            }
          }
        }
        return cardRec;
      };

      const okByLoose = (rec) => {
        const s = rec.score || 0;
        const b = rec.brandSim || 0;
        const c = rec.catOverlap || 0;
        return (b >= 0.45) || (s >= 0.28) || (c >= 1);
      };

      for (const t of State.TARGETS) {
        if (matchedTargetIds.has(t.__id)) continue;

        let best = null, bestScore = -1, bestRec = null;
        for (const card of cards) {
          if (State.matchedList.find((m) => m.key === card.key)) continue;
          const bm = Match.bestMatch({ title: card.title, brand: card.brand, name: card.name }, [t]);
          const score = bm.score || 0;
          if (score > bestScore) { bestScore = score; best = bm; bestRec = card; }
        }

        if (bestRec) {
          bestRec = domCampaignRefresh(bestRec);
          if (!bestRec.kampTipi || !State.enabledCampaignTypes.has(bestRec.kampTipi) || bestRec.kampTipi === "Kargo Bedava") continue;

          const bm2 = Match.bestMatch({ title: bestRec.title, brand: bestRec.brand, name: bestRec.name }, [t]);
          const cand = { ...bestRec, score: bm2.score, brandSim: bm2.brandSim, catOverlap: bm2.catOverlap, bestTargetId: t.__id };

          if (NegativeFilter.shouldReject(cand)) continue;

          if (okByLoose(cand)) candidates.push(cand);
        }
      }

      if (!candidates.length) {
        UI.setProgressIndeterminate("Excel hazırlanıyor… Lütfen bekleyin");
        ExportXLSX.exportMatches();
        setTimeout(() => UI.setProgressIdle(), 600);
        return;
      }

      UI.setProgress(0, 1, "İkinci tarama tamamlandı");
      UI.showModal(candidates);
    },

    commitSelectedAndExport(selected) {
      for (const rec of selected || []) Scan.finalizeRecord(rec);
      UI.setProgressIndeterminate("Excel hazırlanıyor… Lütfen bekleyin");
      ExportXLSX.exportMatches();
      setTimeout(() => UI.setProgressIdle(), 600);
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────────
  const ExportXLSX = {
    exportMatches() {
      if (!State.matchedList.length) {
        alert("Henüz eşleşen yok. Kaydırmaya devam edin veya yeniden deneyin.");
        return;
      }
      const rows = State.matchedList.map((x) => ({
        Marka: x.brand || "",
        "Ürün Adı": x.name || "",
        "Fiyat (TL)": x.price ?? "",
        "Birim Fiyat (TL)": x.birim ?? "",
        "Kampanya Tipi": x.kampLabel || x.kampTipi || x.campaigns?.[0] || "",
        Link: x.href,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ["Marka", "Ürün Adı", "Fiyat (TL)", "Birim Fiyat (TL)", "Kampanya Tipi", "Link"],
      });
      XLSX.utils.book_append_sheet(wb, ws, "Eşleşenler");

      const range = XLSX.utils.decode_range(ws["!ref"]);
      const linkCol = 5;
      for (let r = range.s.r + 1, i = 0; r <= range.e.r; r++, i++) {
        const url = rows[i]?.Link;
        if (!url) continue;
        const addr = XLSX.utils.encode_cell({ r, c: linkCol });
        ws[addr] = { t: "s", v: "Ürüne Git", l: { Target: String(url) } };
        const nameAddr = XLSX.utils.encode_cell({ r, c: 1 });
        if (ws[nameAddr]) ws[nameAddr].l = { Target: String(url) };
      }

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0"),
            mm = String(now.getMonth() + 1).padStart(2, "0"),
            yy = String(now.getFullYear()).slice(-2),
            HH = String(now.getHours()).padStart(2, "0"),
            MM = String(now.getMinutes()).padStart(2, "0");
      const fname = `${dd}.${mm}.${yy} - ${HH}.${MM} - ${State.matchedList.length} eslesme.xlsx`;
      saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fname);
    },

    exportTargets() {
      if (!State.TARGETS.length) {
        alert("Önce XLSX hedef listesini yükleyin.");
        return;
      }
      const rows = State.TARGETS.map((t) => ({
        Marka: t.brand || "",
        Ürün: t.name || "",
        Kategori: t.category || "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows, { header: ["Marka", "Ürün", "Kategori"] });
      XLSX.utils.book_append_sheet(wb, ws, "Hedefler");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "hedef-listesi-ayiklanan.xlsx");
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Targets: XLSX
  // ─────────────────────────────────────────────────────────────────────────────
  const Targets = {
    async importTargetsFromXlsx(ev) {
      const f = ev.target.files?.[0];
      if (!f) return;
      try {
        const data = new Uint8Array(await f.arrayBuffer());
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error("Sayfa bulunamadı.");
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rows.length) throw new Error("Boş dosya.");

        const headers = rows[0].map((h) => Util.normalizeText(String(h)));
        const brandIdx = headers.findIndex((h) => /\b(marka|brand)\b/i.test(h));
        const nameIdx  = headers.findIndex((h) => /\b(ürün|urun|product|title|isim|ad)\b/i.test(h));
        const catIdx   = headers.findIndex((h) => /\b(kategori|category)\b/i.test(h));

        const out = [];
        let bc=0, nc=0, cc=0, id=0;
        for (let i=1;i<rows.length;i++){
          const r = rows[i] || [];
          const brand = (brandIdx>=0 ? String(r[brandIdx]) : "").trim();
          const name  = (nameIdx >=0 ? String(r[nameIdx])  : "").trim();
          const category = (catIdx>=0 ? String(r[catIdx]) : "").trim();
          if (!brand && !name && !category) continue;

          if (brand) bc++; if (name) nc++; if (category) cc++;
          const finalName = name || r.slice(0,Math.min(5,r.length)).map((x)=>String(x||"").trim()).filter(Boolean).join(" ");
          out.push({ __id:id++, brand, name: finalName, category, raw: [brand, finalName, category].filter(Boolean).join(" | ") });
        }
        State.TARGETS = normalizeTargets(out, true);
        GM_setValue(CFG.PREF.TARGETS, State.TARGETS);
        State.lastParsedReport = { brandCount: bc, nameCount: nc, categoryCount: cc };

        // Sözlük + dinamik STOP yeniden kur
        Lexicon.rebuild();

        alert(`XLSX hedef listesi yüklendi: ${State.TARGETS.length} kayıt. Sayfa yenilenecek.`);
        ev.target.value = "";
        setTimeout(() => location.reload(), 350);
      } catch (e) {
        alert("XLSX içe aktarılamadı: " + (e?.message || e));
        ev.target.value = "";
      }
    },
  };

  function normalizeTargets(arr, keepIds=false) {
    const out = [];
    let autoId = 0;
    for (const t of arr || []) {
      if (typeof t === "string") out.push({ __id: autoId++, brand: "", name: t.trim(), category: "", raw: t });
      else if (t && typeof t === "object") {
        const brand = (t.brand || "").toString().trim();
        const name = (t.name || t.product || "").toString().trim();
        const category = (t.category || "").toString().trim();
        const raw = (t.raw || "").toString().trim() || [brand, name, category].filter(Boolean).join(" | ");
        out.push({ __id: keepIds ? t.__id ?? autoId++ : autoId++, brand, name, category, raw });
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // App lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  const App = {
    start(hard = false) {
      Util.waitForBody(() => {
        UI.ensurePanel();
        Lexicon.rebuild();
        if (hard) {
          Observers.stopAutoScroll();
          UI.setRunState(false);
          App._resetState();
        }
        Observers.detectRootsAndObserve();
        Observers.registerCards(State.gridRoot || document.body);
      });
    },
    softRestart() {
      App._resetState();
      window.scrollTo({ top: 0, behavior: "instant" });
      Observers.detectRootsAndObserve();
      Observers.registerCards(State.gridRoot || document.body);
    },
    _resetState() {
      State.totalCardKeys.clear();
      State.processedCount = 0;
      if (State.ui) UI.updateCounters();
      State.catalog.clear();
      State.matchedList.length = 0;
      State.keyOrder.length = 0;
      for (const obs of ["cardObserver","gridMutationObserver","globalMutationObserver"]) {
        if (State[obs]) { try { State[obs].disconnect(); } catch {} State[obs] = null; }
      }
      document.querySelectorAll(CFG.SELECTOR.CARD).forEach(Scan.cleanupRechecks);
      for (const [, ctl] of State.aborters) try { ctl.abort(); } catch {}
      State.dcQueue.length = 0; State.inFlight = 0; State.cooldownUntil = 0; State.aborters.clear();
      UI.refreshStatus();
    },
    hookSpaNavigation() {
      const _push = history.pushState, _replace = history.replaceState;
      history.pushState = function () { const r = _push.apply(this, arguments); setTimeout(() => App.start(true), 0); return r; };
      history.replaceState = function () { const r = _replace.apply(this, arguments); setTimeout(() => App.start(false), 0); return r; };
      window.addEventListener("popstate", () => setTimeout(() => App.start(true), 0));
    },
    registerMenu() {
      GM_registerMenuCommand("Debug Aç/Kapa", () => {
        State.DEBUG = !State.DEBUG;
        GM_setValue(CFG.PREF.DEBUG, State.DEBUG);
        alert("Debug: " + (State.DEBUG ? "Açık" : "Kapalı"));
      });
      GM_registerMenuCommand("Hedefleri Resetle", () => {
        GM_setValue(CFG.PREF.TARGETS, []);
        State.TARGETS = [];
        Lexicon.rebuild();
        alert("Hedefler temizlendi.");
        UI.refreshStatus();
      });
    },
  };

  App.start(true);
  App.hookSpaNavigation();
  App.registerMenu();
    })();
  });
})();

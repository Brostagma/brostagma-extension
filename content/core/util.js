/* Util — yardımcılar */
(function(ns){
  const Util = ns.Util || {};

  Util.sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
  Util.jitter = (a,b)=> a + Math.floor(Math.random()*(Math.max(0,b-a)));

  Util.round2 = (n)=> Math.round((Number(n)||0)*100)/100;

  Util.norm = (s)=> String(s||"").trim()
    .replace(/\s+/g," ")
    .replace(/[ \t]/g," ")
    .trim();

  Util.stripDiacritics = (t)=> (t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  Util.normalizeText = (t)=> Util.stripDiacritics(Util.norm(t||"").toLowerCase());

  Util.escapeHtml = (s)=> String(s??"").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));

  Util.absolute = (href)=>{
    try{ const u=new URL(href, location.href); return u.href; }catch{ return href; }
  };

  Util.parsePrice = (txt)=>{
    if(!txt) return null;
    const s = Util.norm(txt).replace(/\./g,"").replace(",",".");
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };

  Util.canonicalKey = (href)=>{
    try{
      const u=new URL(href, location.href);
      const m = u.pathname.match(/-p-(\d+)/i);
      return m ? `ty_${m[1]}` : u.pathname.replace(/[^\w]/g,"_");
    }catch{ return String(href||""); }
  };

  Util.waitForBody = (fn)=>{
    if(document.body) return fn();
    const t = setInterval(()=>{ if(document.body){ clearInterval(t); fn(); }}, 30);
  };

  Util.log = (...a)=> console.debug("[EminPro]", ...a);

  Util.toast = (msg, kind)=> {
    try{ ns.UI && ns.UI.toast && ns.UI.toast(msg, kind); }catch{}
  };

  ns.Util = Util;
})(window.EminPro = window.EminPro || {});

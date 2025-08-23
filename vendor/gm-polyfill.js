// Minimal GM_* polyfill for MV3 content-scripts (localStorage based)
(function(w){
  function safeKey(k){ return String(k || ""); }
  w.GM_getValue = function(key, def){
    try{ const raw = localStorage.getItem(safeKey(key)); return raw==null ? def : JSON.parse(raw); }
    catch{ return def; }
  };
  w.GM_setValue = function(key, val){
    try{ localStorage.setItem(safeKey(key), JSON.stringify(val)); }catch{}
  };
  w.GM_addStyle = function(css){
    try{ const id = "gm-style-"+btoa(css).replace(/=+$/,"");
      if(document.getElementById(id)) return;
      const s=document.createElement("style"); s.id=id; s.textContent=css; document.head.appendChild(s);
    }catch{}
  };
  w.GM_registerMenuCommand = function(){ /* noop in MV3 */ };
})(window);

/* boot — sırayı koru, güvenli başlat */
(function(ns){
  try{
    console.debug("[EminPro] boot");
    // Panel her durumda görünsün
    try{ ns.UI && ns.UI.ensurePanel && ns.UI.ensurePanel(); }catch{}
    if (ns.App && ns.App.start) {
      ns.App.start();
    } else {
      document.addEventListener("DOMContentLoaded", ()=> ns.App && ns.App.start && ns.App.start());
    }
  }catch(e){ console.warn("[EminPro] boot error:", e); }
})(window.EminPro = window.EminPro || {});

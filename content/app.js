/* App — başlat / kaydırma toggle */
(function(ns){
  const { CFG, State, UI, Observers, Util } = ns;

  function _start(){
    try{
      UI.ensurePanel && UI.ensurePanel();
      State.gridRoot = document.querySelector(CFG.SELECTOR.GRID_CANDIDATE) || document.body;
      Observers.registerCards && Observers.registerCards(State.gridRoot);
      UI.setStatus && UI.setStatus("Hazır");
    }catch(e){ console.warn("[App.start] e:",e); }
  }

  function start(){
    // Util.waitForBody bazı sürümlerde callback, bazısında promise olabilir
    try{
      if (typeof Util?.waitForBody === "function") {
        // callback stilini destekle
        const r = Util.waitForBody(_start);
        // promise döndüren varyant için:
        if (r && typeof r.then === "function") r.then(_start);
      } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _start, { once:true });
      } else {
        _start();
      }
    }catch(e){ console.warn("[App.start:init] e:", e); _start(); }
  }

  function toggleAutoScroll(){
    if(State.autoTimer){ Observers.stopAutoScroll(); return false; }
    Observers.startAutoScroll(); return true;
  }

  function stopAutoScroll(){ Observers.stopAutoScroll(); }

  ns.App = { start, toggleAutoScroll, stopAutoScroll };
})(window.EminPro = window.EminPro || {});

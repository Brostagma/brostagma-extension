/* Observers — otomatik kaydırma + kart kaydı */
(function(ns){
  const { CFG, State, Util, Scan, UI } = ns;

  function isAtScrollEnd(){
    return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 4);
  }
  function doScrollBy(y){ window.scrollBy({ top: y, left: 0, behavior: "smooth" }); }

  async function animateScrollBy(distance,duration,setRafId,isRunning){
    return new Promise((resolve)=>{
      const startY=window.scrollY, targetY=startY+distance, start=performance.now();
      function step(now){
        if(!isRunning()) return resolve();
        const t = Math.min(1, (now-start)/duration);
        const eased = t<0.5 ? 2*t*t : -1+(4-2*t)*t;
        window.scrollTo(0, startY + (targetY-startY)*eased);
        if(t<1) setRafId(requestAnimationFrame(step)); else resolve();
      }
      setRafId(requestAnimationFrame(step));
    });
  }

  // Scan hazır olana kadar güvenli çağrı
  function callWhenScanReady(fn, maxTry=60, delay=100){
    let tries = 0;
    (function loop(){
      const S = ns.Scan;
      if (S && typeof S.processVisibleCard === "function") { try{ fn(S); }catch(e){ console.warn("[Observers] fn error:",e);} return; }
      if (++tries > maxTry) { console.warn("[Observers] Scan not ready (timeout)"); return; }
      setTimeout(loop, delay);
    })();
  }

  const Observers = {
    async startAutoScroll(){
      Observers.stopAutoScroll();
      State.SCROLL_STEP=Math.max(200,parseInt(State.ui?.inputStep?.value||`${CFG.DEF.STEP}`,10));
      State.SCROLL_DELAY=Math.max(200,parseInt(State.ui?.inputDelay?.value||`${CFG.DEF.DELAY}`,10));
      if (window.GM_setValue){ GM_setValue(CFG.PREF.STEP,State.SCROLL_STEP); GM_setValue(CFG.PREF.DELAY,State.SCROLL_DELAY); }

      let running=true, rafId=0;
      State.autoTimer={stop:()=>{running=false; cancelAnimationFrame(rafId);}};

      while(running){
        await animateScrollBy(State.SCROLL_STEP, State.SCROLL_DELAY, (id)=>{rafId=id;}, ()=>running);
        Observers.registerCards(State.gridRoot||document.body);
        if(isAtScrollEnd()){ await Util.sleep?.(200); doScrollBy(1); }
      }
    },

    stopAutoScroll(){
      try{ State.autoTimer?.stop?.(); }catch{}
      State.autoTimer=null;
    },

    registerCards(root){
      const exec = (S)=>{
        try{
          const grid = root || document.querySelector(CFG.SELECTOR.GRID_CANDIDATE) || document.body;
          if (!grid) return;
          const cards = grid.querySelectorAll(CFG.SELECTOR.CARD);
          cards.forEach((card)=> {
            try { S.processVisibleCard(card); }
            catch (e){ console.warn("[Observers.processVisibleCard] e:", e); }
          });
        }catch(e){ console.warn("[Observers.registerCards] e:", e); }
      };
      callWhenScanReady(exec);
    }
  };

  ns.Observers = Observers;
})(window.EminPro = window.EminPro || {});

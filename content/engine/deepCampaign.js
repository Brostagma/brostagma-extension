/* DeepCampaign — DC kuyruğu/istatistik/kapı */
(function(ns){
  const { Util, CFG } = ns;

  const Q=[], SEEN=new Set();
  let inFlight=0, cooling=false;

  function stats(){ return { queued: Q.length, inFlight }; }

  function push(key, task){
    if(SEEN.has(key)) return false;
    SEEN.add(key);
    Q.push({key, task});
    tick();
    return true;
  }

  async function tick(){
    if(cooling) return;
    while(inFlight < CFG.DC.CONCURRENCY && Q.length){
      const item = Q.shift(); if(!item) break;
      inFlight++;
      try{
        await Util.sleep(Util.jitter(CFG.DC.DELAY_MIN_MS, CFG.DC.DELAY_MAX_MS));
        await item.task();
      }catch(e){ console.warn("[DC] task error", e); }
      finally{ inFlight--; }
    }
    if(Q.length===0 && inFlight===0){
      cooling=true;
      setTimeout(()=>{ cooling=false; }, CFG.DC.COOLDOWN_MS);
    }
  }

  ns.DeepCampaign = { push, stats, _Q:Q, _SEEN:SEEN };
})(window.EminPro = window.EminPro || {});

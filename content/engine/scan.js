/* Scan — kart işleme, eşleşme ve sayaçlar */
(function(ns){
  const { CFG, State, Util, Match, DeepCampaign, UI } = ns;

  function findProductLink(card){
    const sel = CFG.SELECTOR.LINK_IN_CARD;
    const a = card.querySelector(sel);
    return a || null;
  }

  function extractTitle(card){
    const el = card.querySelector(CFG.SELECTOR.TITLE_IN_CARD) || card;
    return Util.norm(el?.innerText||"").slice(0,300);
  }

  function extractBrandFromTitle(title){
    // Basit: ilk token büyük harf geçerlilik; istenirse geliştirilebilir
    const toks = title.split(/\s+/);
    const cand = toks[0]||"";
    return cand.length>=2 ? cand : "";
  }

  const Scan = {
    processVisibleCard(card){
      if(card.__eminProcessing) return; card.__eminProcessing=true;
      try{
        const linkEl=findProductLink(card); if(!linkEl){card.__eminProcessing=false;return;}
        const href=linkEl.getAttribute("href")||""; if(!href||/\/sr(\?|$)/i.test(href)){card.__eminProcessing=false;return;}
        const key=Util.canonicalKey(href); if(!key){card.__eminProcessing=false;return;}

        const title=extractTitle(card);
        const brand=extractBrandFromTitle(title);
        const targets=(ns.Targets && ns.Targets.current && ns.Targets.current.rows)||[];

        let result=null;
        if(targets.length){
          result=Match.bestMatch(title, targets);
        }

        // Sayaç: taranan kart
        State.scanned = (State.scanned||0) + 1;

        if(result){
          const label=result.label;
          if(label==="confident" || label==="borderline"){
            State.matchedList = State.matchedList || [];
            State.matchedList.push({ key, href:Util.absolute(href), title, brand, label, sig:result.s });
          }
          // DC: sadece borderline/weak için derin kontrol
          if(label!=="confident"){
            DeepCampaign.push(key, async()=>{ /* burada gerekli ayrıntı istekleri yapılabilir */ });
          }
        }

        UI.updateCounters && UI.updateCounters();
      }catch(e){ console.warn("[Scan.processVisibleCard] e:", e); }
      finally{ card.__eminProcessing=false; }
    }
  };

  ns.Scan = Scan;
})(window.EminPro = window.EminPro || {});

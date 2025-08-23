(function(ns){
  const { UI, State, Util, Match, Lexicon, Catalog, AutoFilter } = ns;

  const ExportGate = {
    async runWithDCGate(task){
      UI.setButtonsDisabled(true);
      UI.setProgressIndeterminate("Kontrol ediliyor…");
      try{
        const DC = { isBusy(){ return State.DC_ENABLED && (State.inFlight>0 || State.dcQueue.length>0 || Date.now()<State.cooldownUntil); } };
        async function waitUntilIdle(onTick){ while(DC.isBusy()){ onTick?.(); await Util.sleep(500); } }
        if (DC.isBusy()) {
          State.exportPending = true;
          UI.setProgressIndeterminate("DC kuyruğu çalışıyor… Bittiğinde indirme başlayacak");
          await waitUntilIdle(()=> UI.refreshStatus());
        }
        State.exportPending = false;
        await task();
      } finally {
        UI.setButtonsDisabled(false);
      }
    }
  };

  const QuickScan = {
    async runAddStageThenPruneStageThenExport(){
      ns.UI.ensurePrunePanel();
      try{
        // 1) Aday Ekle
        const selectedForAdd = await QuickScan._runAddStage();
        if (selectedForAdd?.length) { for (const rec of selectedForAdd) ns.Scan.finalizeRecord(rec); }

        // 2) Şüpheli Ayıklama
        await QuickScan._runPrunePanel();

        // 3) Excel
        UI.setProgressIndeterminate("Excel hazırlanıyor… Lütfen bekleyin");
        await Util.sleep(30);
        ns.ExportXLSX.exportMatches();
        setTimeout(()=>UI.setProgressIdle(), 600);
      }catch(e){
        alert("İndirme öncesi akışta hata: " + (e?.message||e));
        UI.setProgressIdle();
      }
    },

    async _runAddStage(){
      if (!State.TARGETS.length || !State.catalog.size) return [];
      UI.setProgressIndeterminate("İkinci tarama (kaçanlar) çalışıyor…");

      const matchedTargetIds = new Set(State.matchedList.map((m)=>m.bestTargetId).filter((x)=>x!=null));
      const cards = Catalog.values().filter((c)=>c && c.href && c.key);
      const candidates = [];

      const domCampaignRefresh = (cardRec) => {
        if (cardRec.campaigns && cardRec.campaigns.length) return cardRec;
        const sel = `${ns.CFG.SELECTOR.CARD} a[href*="${cardRec.key}"]`;
        const anchor = document.querySelector(sel);
        if (anchor) {
          const card = anchor.closest(ns.CFG.SELECTOR.CARD);
          if (card) {
            const found = ns.Scan.detectCampaigns(card);
            if (found.length) {
              const r = Match.resolveCampaignTypeAndLabel(found);
              cardRec.campaigns = found; cardRec.kampTipi = r.type; cardRec.kampLabel = r.label;
              cardRec.birim = Match.unitPriceByLabel(cardRec.price, r.label);
              Catalog.add(cardRec);
            }
          }
        }
        return cardRec;
      };

      const okByLoose = (rec, tgt) => {
        const s = rec.score || 0, b = rec.brandSim || 0, c = rec.catOverlap || 0;
        let nameOverlap=0, nameRatio=0;
        if (tgt){
          const a=new Set(Lexicon.tokenize(rec.name||""));
          const t=new Set(Lexicon.tokenize(tgt.name||""));
          const inter=[...a].filter(x=>x.length>=3 && t.has(x));
          nameOverlap=inter.length;
          const uni=new Set([...a,...t]).size;
          nameRatio=uni? inter.length/uni : 0;
        }
        const byScore = s >= 0.23;
        const byName  = (nameOverlap>=2) || (nameRatio>=0.30);
        const pass = (b >= 0.45) || byScore || (c >= 1) || byName;
        if (!pass) return false;
        const bm = { brandSim: b, catOverlap: c, score: s };
        return !AutoFilter.shouldReject({ title: rec.title, brand: rec.brand, name: rec.name }, bm);
      };

      const matchedKeys = new Set(State.matchedList.map(m=>m.key));
      for (const t of State.TARGETS) {
        if (matchedTargetIds.has(t.__id)) continue;
        let bestScore=-1, bestRec=null;
        for (const card of cards) {
          if (matchedKeys.has(card.key)) continue;
          const bm = Match.bestMatch({ title: card.title, brand: card.brand, name: card.name }, [t]);
          const score = bm.score || 0;
          if (score > bestScore) { bestScore = score; bestRec = {rec:card, bm}; }
        }
        if (bestRec?.rec) {
          const rec0 = domCampaignRefresh(bestRec.rec);
          if (!rec0.kampTipi || !State.enabledCampaignTypes.has(rec0.kampTipi) || rec0.kampTipi==="Kargo Bedava") continue;
          const bm2 = Match.bestMatch({ title: rec0.title, brand: rec0.brand, name: rec0.name }, [t]);
          const cand = { ...rec0, score: bm2.score, brandSim: bm2.brandSim, catOverlap: bm2.catOverlap, bestTargetId: t.__id };
          if (okByLoose(cand, t)) candidates.push(cand);
        }
      }

      if (!candidates.length) return [];

      return await new Promise((resolve)=>{
        UI.setProgress(0,1,"İkinci tarama tamamlandı");
        ns.UI.showModal(candidates,{
          title:"Kesinleşmeyen Eşleşmeler",
          desc:"Aşağıdaki ürünler ikinci taramada aday olarak bulundu. Excel’e eklemek istediklerinizi seçin.",
          precheck:false,
          confirmText:"Seçilenleri Ekle",
          onConfirm:(sel)=>{ resolve(sel||[]); },
          onCancel:()=>{ resolve([]); }
        });
      });
    },

    async _runPrunePanel(){
      const suspicious = (function listSuspicious(list){
        function isWeak(rec){
          const s = rec.score || 0, b = rec.brandSim || 0, c = rec.catOverlap || 0;
          if (s >= 0.23) return false;
          if (b >= 0.70) return false;
          if (c >= 1)   return false;
          // isim temelli
          let nameOverlap = 0, nameRatio = 0;
          const tgt = State.TARGETS.find(tt => tt.__id === rec.bestTargetId);
          if (tgt) {
            const nameTok = new Set(ns.Lexicon.tokenize(rec.name || ""));
            const tgtTok  = new Set(ns.Lexicon.tokenize(tgt.name || ""));
            const inter = [...nameTok].filter(x => x.length >= 3 && tgtTok.has(x));
            nameOverlap = inter.length;
            const uni = new Set([...nameTok, ...tgtTok]).size;
            nameRatio = uni ? inter.length / uni : 0;
          }
          if (nameOverlap >= 2 || nameRatio >= 0.30) return false;
          return true;
        }
        return (list||[]).filter(isWeak);
      })(State.matchedList);

      if (!suspicious.length) return;

      UI.setProgressIndeterminate("Şüpheli ayıklama hazırlanıyor…");
      await Util.sleep(10);

      await new Promise((resolve)=>{
        State.pruneUI.show(suspicious, {
          precheck:false,
          onApply:(selectedToKeep)=>{
            const keepKeys = new Set((selectedToKeep||[]).map(r=>r.key));
            const suspiciousKeys = new Set(suspicious.map(r=>r.key));
            State.matchedList = State.matchedList.filter(r => !suspiciousKeys.has(r.key) || keepKeys.has(r.key));
            UI.updateCounters();
            resolve();
          },
          onCancel:()=>{
            const suspiciousKeys = new Set(suspicious.map(r=>r.key));
            State.matchedList = State.matchedList.filter(r => !suspiciousKeys.has(r.key));
            UI.updateCounters();
            resolve();
          }
        });
      });
    }
  };

  ns.ExportGate = ExportGate;
  ns.QuickScan  = QuickScan;
})(window.EminPro = window.EminPro || {});

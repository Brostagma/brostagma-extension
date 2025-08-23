/* Lexicon — tokenize / dinamik stop sözlük / rebuild */
(function(ns){
  const { Util = {}, State = {} } = ns;

  const Lexicon = {
    has(tok){ return !!(State.LEX && State.LEX.vocab && State.LEX.vocab.has(tok)); },
    norm(t){
      const s = String(t||"").trim().toLowerCase();
      return Util.stripDiacritics(s).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
    },
    tokenize(s){
      const low = this.norm(s);
      if(!low) return [];
      return low.split(/\s+/).map((t)=>t
        .replace(/(ları|leri)$/i,"")
        .replace(/(lar|ler)$/i,"")
        .replace(/(lı|li|lu|lü)$/i,"")
        .replace(/(cı|ci|cu|cü|çı|çi|çu|çü)$/i,""))
        .filter(Boolean);
    },
    buildFromTargets(targets){
      const tokenFreq=new Map();
      const brandSpread=new Map();
      const categoryTokens=new Set();
      const arr = Array.isArray(targets) ? targets : [];
      for(const t of arr){
        const bt=this.tokenize(t.brand);
        const nt=this.tokenize(t.name);
        const ct=this.tokenize(t.category);
        for(const w of [...bt, ...nt]) tokenFreq.set(w, (tokenFreq.get(w)||0)+1);
        for(const w of bt){
          const s = brandSpread.get(w)||new Set();
          if (t.brand) s.add(this.norm(t.brand));
          brandSpread.set(w,s);
        }
        for(const w of ct) categoryTokens.add(w);
      }
      const N=Math.max(1,arr.length);
      const FREQ_RATIO=0.30;
      const dynamic=new Set();
      for(const [tok,freq] of tokenFreq){
        const ratio=freq/N;
        const spread=(brandSpread.get(tok)||new Set()).size;
        const short = tok.length<=3;
        const frequent = ratio>=FREQ_RATIO || (short && ratio>=FREQ_RATIO*0.6);
        const nonDistinct = spread>=Math.min(5, Math.ceil(N*0.15));
        if (frequent && nonDistinct) dynamic.add(tok);
      }
      return { vocab:new Set(tokenFreq.keys()), tokenFreq, categoryTokens, dynamic };
    },
    rebuild(){
      try{
        const T = (ns.Targets && ns.Targets.current && ns.Targets.current.rows) || [];
        const built = this.buildFromTargets(T);
        State.LEX = built;
        State.STOP_DYNAMIC = built.dynamic;
        if (ns.Match && typeof ns.Match.setDynamicStop === "function"){
          ns.Match.setDynamicStop(State.STOP_DYNAMIC);
        }
        if (ns.UI && ns.UI.toast) ns.UI.toast("Lexicon güncellendi","ok");
      }catch(e){ console.warn("[Lexicon.rebuild] hata:", e); }
    }
  };

  ns.Lexicon = Lexicon;
})(window.EminPro = window.EminPro || {});

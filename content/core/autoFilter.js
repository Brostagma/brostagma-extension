(function(ns){
  const { State, Lexicon } = ns;
  ns.AutoFilter = {
    shouldReject({title,brand,name}, bm){
      if(!State.TARGETS.length) return false;
      const txt=[brand,name,title].filter(Boolean).join(" ");
      const toks=new Set(Lexicon.tokenize(txt));
      const hasWhitelistOverlap=[...toks].some((t)=>State.LEX?.vocab?.has(t));
      const brandSim=bm?.brandSim??0;
      const catOverlap=bm?.catOverlap??0;
      const score=bm?.score??0;
      const hasAnyCategory=(State.LEX?.categoryTokens?.size||0)>0;

      if(hasAnyCategory){
        if(brandSim>=0.88 || catOverlap>=1 || score>=0.23) return false;
        return true;
      }
      if(hasWhitelistOverlap || brandSim>=0.50 || score>=0.23) return false;
      return true;
    }
  };
})(window.EminPro = window.EminPro || {});

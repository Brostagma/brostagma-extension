(function(ns){
  const { State } = ns;
  ns.Catalog = {
    add(rec){
      if(!rec||!rec.key) return;
      if(!State.catalog.has(rec.key)){
        State.catalog.set(rec.key,rec);
        State.keyOrder.push(rec.key);
        if(State.keyOrder.length>State.MAX_SCANNED_KEEP){
          const drop=State.keyOrder.shift(); State.catalog.delete(drop);
        }
      }else{
        State.catalog.set(rec.key,{...State.catalog.get(rec.key),...rec});
      }
    },
    values(){ return [...State.catalog.values()]; }
  };
})(window.EminPro = window.EminPro || {});

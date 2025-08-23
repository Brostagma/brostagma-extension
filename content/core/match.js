/* Match — sinyal/benzerlik + iki-aşamalı sınıflandırıcı (v3.9.5 uyum) */
(function(ns){
  const { Lexicon, Util, State } = ns;

  const STOP_BASE=new Set([
    "unisex","set","paket","adet","renk","beden","boy","hediye","yeni","orijinal",
    "urun","ürün","orjinal","model","kozmetik","shop","magaza","mağaza"
  ]);
  let STOP_DYNAMIC=new Set();
  function setDynamicStop(s){STOP_DYNAMIC=s||new Set();}
  function isStop(tok){return STOP_BASE.has(tok)||STOP_DYNAMIC.has(tok);}

  function tokenWeights(text){
    const weights=new Map(); const toks=Lexicon.tokenize(text||"");
    for(const tok of toks){
      if(isStop(tok)){weights.set(tok,(weights.get(tok)||0)+0.15); continue;}
      let w=tok.length<=2?0.5:1; if(Lexicon.has(tok)) w+=0.10; weights.set(tok,(weights.get(tok)||0)+w);
    } return weights;
  }

  function wJaccard(A,B){
    let inter=0,uni=0;
    const keys=new Set([...A.keys(), ...B.keys()]);
    for(const k of keys){ const a=A.get(k)||0, b=B.get(k)||0; inter+=Math.min(a,b); uni+=Math.max(a,b); }
    return uni?inter/uni:0;
  }

  // Basit Jaro-Winkler (küçük stringler için yeterli)
  function jaroWinkler(a,b){
    a=Util.normalizeText(a||""); b=Util.normalizeText(b||"");
    if(a===b) return 1; if(!a||!b) return 0;
    const m=Math.floor(Math.max(a.length,b.length)/2)-1;
    const aFlags=Array(a.length).fill(false), bFlags=Array(b.length).fill(false);
    let matches=0, transpositions=0;
    for(let i=0;i<a.length;i++){
      const start=Math.max(0,i-m), end=Math.min(i+m+1,b.length);
      for(let j=start;j<end;j++){
        if(!bFlags[j] && a[i]===b[j]){ aFlags[i]=bFlags[j]=true; matches++; break; }
      }
    }
    if(matches===0) return 0;
    let k=0;
    for(let i=0;i<a.length;i++){
      if(aFlags[i]){
        while(!bFlags[k]) k++;
        if(a[i]!==b[k]) transpositions++;
        k++;
      }
    }
    const m3 = matches/ a.length + matches/ b.length + (matches - transpositions/2)/matches;
    let jw = m3/3;
    // Winkler prefix
    let l=0; while(l<4 && a[l]===b[l]) l++;
    jw += l*0.1*(1-jw);
    return jw;
  }

  function brandMatchScore(a,b){
    const na=(Lexicon.tokenize(a||"").join(" ")).trim();
    const nb=(Lexicon.tokenize(b||"").join(" ")).trim();
    if(!na||!nb) return 0;
    if(na===nb) return 1;
    const A=new Set(na.split(" ")), B=new Set(nb.split(" "));
    const inter=[...A].filter(x=>B.has(x)).length;
    const jaro=jaroWinkler(na,nb);
    return Math.max(inter/Math.max(1,Math.min(A.size,B.size)), jaro);
  }

  function signalsFor(title, target){
    const wtTitle = tokenWeights([target.brand, title].filter(Boolean).join(" "));
    const wtTarget= tokenWeights([target.brand, target.name].filter(Boolean).join(" "));

    const score = wJaccard(wtTitle, wtTarget);

    const brandSim = brandMatchScore(target.brand, title);
    const nameToks = new Set(Lexicon.tokenize(target.name));
    const titleToks= new Set(Lexicon.tokenize(title));
    const nameOverlap = [...nameToks].filter(t=>titleToks.has(t)).length;
    const nameRatio   = nameToks.size ? (nameOverlap/nameToks.size) : 0;

    const catToks = new Set(Lexicon.tokenize(target.category));
    const catOverlap = [...catToks].filter(t=>titleToks.has(t)).length;

    return { score, brandSim, nameOverlap, nameRatio, catOverlap };
  }

  function classify(sig){
    // v3.9.5: confident ANY: score≥0.30 OR brandSim≥0.85 OR catOverlap≥2 OR nameOverlap≥3 OR nameRatio≥0.45
    if(sig.score>=0.30 || sig.brandSim>=0.85 || sig.catOverlap>=2 || sig.nameOverlap>=3 || sig.nameRatio>=0.45){
      return "confident";
    }
    // borderline ANY: score≥0.12 OR brandSim≥0.35 OR catOverlap≥1 OR nameOverlap≥1 OR nameRatio≥0.20
    if(sig.score>=0.12 || sig.brandSim>=0.35 || sig.catOverlap>=1 || sig.nameOverlap>=1 || sig.nameRatio>=0.20){
      return "borderline";
    }
    return "weak";
  }

  function bestMatch(title, targets){
    let best=null;
    for(const t of targets||[]){
      const s=signalsFor(title,t);
      const label=classify(s);
      if(!best || s.score>(best.s.score||0)){ best={ target:t, s, label }; }
    }
    return best;
  }

  ns.Match = { signalsFor, classify, bestMatch, setDynamicStop };
})(window.EminPro = window.EminPro || {});

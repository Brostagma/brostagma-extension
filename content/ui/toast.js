// content/ui/toast.js — Mini durum bildirimleri (birleştirici + hız sınırlı)
(function(ns){
  const Z = (ns.CFG && ns.CFG.UI && ns.CFG.UI.Z) || 2147483647;

  const Toast = (function(){
    let wrap = null;
    const MAX_VISIBLE = 3;
    const RATE_MS = 250;
    let lastTime = 0;
    const map = new Map(); // key = kind|msg

    function ensureWrap(){
      if (wrap && document.body.contains(wrap)) return wrap;
      wrap = document.createElement("div");
      wrap.id = "ep-mini-wrap";
      wrap.style.cssText = `
        position:fixed; right:12px; bottom:12px; z-index:${Z};
        display:flex; flex-direction:column; gap:6px; pointer-events:none;
      `;
      document.body.appendChild(wrap);
      injectCss();
      return wrap;
    }

    function injectCss(){
      if (document.getElementById("ep-mini-css")) return;
      const st = document.createElement("style");
      st.id = "ep-mini-css";
      st.textContent = `
#ep-mini-wrap .ep-mini {
  pointer-events:auto; display:flex; align-items:center; gap:8px;
  min-width:190px; max-width:300px; padding:7px 10px;
  border-radius:10px; border:1px solid #2a3346;
  background:#121826; color:#e5e7eb; box-shadow:0 12px 26px rgba(0,0,0,.45);
  font:12px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Arial; opacity:0; transform:translateY(8px);
  transition:opacity .16s ease, transform .16s ease;
}
#ep-mini-wrap .ep-mini.in { opacity:1; transform:translateY(0); }
#ep-mini-wrap .ep-mini.out{ opacity:0; transform:translateY(8px); }

.ep-mini .dot { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:#22c55e; }
.ep-mini.ok   .dot{ background:#22c55e; }
.ep-mini.info .dot{ background:#60a5fa; }
.ep-mini.warn .dot{ background:#f59e0b; }
.ep-mini.err  .dot{ background:#ef4444; }

.ep-mini .txt { flex:1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ep-mini .x   { background:transparent; border:0; color:#9ca3af; cursor:pointer; font-size:14px; line-height:1; padding:0 4px; }
.ep-mini .cnt { font-weight:700; opacity:.9; display:none; }
      `;
      document.head.appendChild(st);
    }

    function removeEl(el){
      try{
        el.classList.remove("in"); el.classList.add("out");
        setTimeout(()=>{ el.remove(); map.delete(el.dataset.key); }, 200);
      }catch{}
    }
    function resetTimer(el){
      clearTimeout(el._t);
      const n = Number(el.dataset.count||1);
      const extra = Math.min(1500, (n-1)*400);
      el._t = setTimeout(()=> removeEl(el), 2000 + extra);
    }
    function enforceMax(){
      const items = [...wrap.querySelectorAll(".ep-mini")];
      if (items.length <= MAX_VISIBLE) return;
      for (let i = MAX_VISIBLE; i < items.length; i++) removeEl(items[i]);
    }

    function show(msg, kind="info"){
      try{
        const now = performance.now();
        if (now - lastTime < RATE_MS){
          setTimeout(()=> show(msg, kind), RATE_MS);
          return null;
        }
        lastTime = now;
        ensureWrap();

        const key = (String(kind)+"|"+String(msg)).toLowerCase();
        const old = map.get(key);
        if (old){
          const cnt = Number(old.dataset.count||1)+1;
          old.dataset.count = String(cnt);
          const c = old.querySelector(".cnt");
          if (c){ c.textContent = "×"+cnt; c.style.display = "inline-block"; }
          resetTimer(old);
          return old;
        }

        const el = document.createElement("div");
        el.className = "ep-mini "+kind;
        el.dataset.key = key;
        el.dataset.count = "1";
        el.innerHTML = `
          <span class="dot"></span>
          <span class="txt"></span>
          <span class="cnt"></span>
          <button class="x" aria-label="Kapat">×</button>
        `;
        el.querySelector(".txt").textContent = String(msg||"");
        wrap.prepend(el);
        requestAnimationFrame(()=> el.classList.add("in"));
        map.set(key, el);

        el.querySelector(".x").addEventListener("click", ()=> removeEl(el));
        el.addEventListener("mouseenter", ()=> clearTimeout(el._t));
        el.addEventListener("mouseleave", ()=> resetTimer(el));
        resetTimer(el);

        enforceMax();
        return el;
      }catch(e){ console.warn("[Toast] error:", e); }
      return null;
    }

    // UI API
    function bindUI(){
      ns.UI = Object.assign(ns.UI||{}, {
        toast: show,
        toastOk:   (m)=>show(m,"ok"),
        toastInfo: (m)=>show(m,"info"),
        toastWarn: (m)=>show(m,"warn"),
        toastErr:  (m)=>show(m,"err"),
      });
    }
    bindUI();
    return { show };
  })();

  ns.Toast = Toast;
})(window.EminPro = window.EminPro || {});

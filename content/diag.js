// content/diag.js — temporary diagnostics for panel visibility
(function(){
  const TAG = "[EminPro DIAG]";
  function log(...a){ try{ console.log(TAG, ...a); }catch{} }
  function once(fn){ try{ fn(); }catch(e){ log("ERR:", e); } }

  log("Hello from diag.js — build:", chrome?.runtime?.id || "no-id");

  // 1) Basic DOM readiness
  once(()=> log("document.readyState:", document.readyState, "body:", !!document.body));

  // 2) Extension namespace presence
  // NOTE: Content-script world is isolated; we can see window.EminPro here if other scripts ran.
  once(()=>{
    const ns = window.EminPro;
    log("window.EminPro present:", !!ns, ns && Object.keys(ns).sort());
  });

  // 3) Panel element state (if any)
  once(()=>{
    const p = document.querySelector(".ep-panel");
    if (!p) return log("ep-panel not found in DOM.");
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    log("ep-panel found. style:", {display:cs.display, visibility:cs.visibility, opacity:cs.opacity, zIndex:cs.zIndex, position:cs.position, top:cs.top, right:cs.right, left:cs.left});
    log("ep-panel rect:", {x:r.x, y:r.y, w:r.width, h:r.height});
  });

  // 4) Try to force a visible marker at top-right to rule out z-index issues
  once(()=>{
    const probe = document.createElement("div");
    probe.id = "__eminpro_probe__";
    probe.textContent = "EP PROBE";
    Object.assign(probe.style, {
      position: "fixed", top: "8px", right: "8px",
      padding: "6px 10px", background: "#ff0066", color: "#fff",
      border: "2px solid #000", font: "12px/1.2 monospace",
      zIndex: "2147483647", borderRadius: "6px"
    });
    document.body && document.body.appendChild(probe);
    log("probe appended. rect:", probe.getBoundingClientRect());
    setTimeout(()=>{ if (probe && probe.parentNode) probe.parentNode.removeChild(probe); }, 5000);
  });

  // 5) Local storage snapshot
  once(()=>{
    try{
      const out = [];
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.includes("eminpro")) out.push([k, localStorage.getItem(k)]);
      }
      log("localStorage keys (eminpro):", out);
    }catch(e){ log("localStorage read error", e); }
  });

  // 6) Frame / origin info
  once(()=>{
    log("location.href:", location.href);
    log("frame nesting level:", window.top === window ? "top" : "child frame");
  });

  // 7) Try to call App.start again (if present)
  once(()=>{
    const ns = window.EminPro;
    if (ns && ns.App && typeof ns.App.start === "function"){
      log("Calling App.start(true) for re-init...");
      try { ns.App.start(true); log("App.start re-init done."); } catch(e){ log("App.start error:", e); }
    }else{
      log("App.start not available; check manifest order / script errors.");
    }
  });

})();

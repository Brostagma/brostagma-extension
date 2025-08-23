// content/ui/counters.js — Animasyonlu sayaç; DC anlık; status (toast = UI.toast)
(function (ns) {
  const { State = {} } = ns;

  function pick() {
    const root = document;
    const el = (sels) => sels.map((s) => root.querySelector(s)).find(Boolean);
    return {
      total:   el(["#ep-c-scan"]),
      matched: el(["#ep-c-match"]),
      dcQ:     el(["#ep-dc-q"]),
      dcA:     el(["#ep-dc-a"]),
      status:  el(["#ep-status"]),
    };
  }

  function tweenTo(kind, val) {
    const els = pick();
    const node = els[kind];
    if (!node) return;
    const from = parseInt(node.textContent || "0", 10) || 0;
    const to = Math.max(0, parseInt(val || 0, 10));
    if (to === from) return;
    const start = performance.now(), dur = 280;
    function step(now){
      const t = Math.min(1, (now - start) / dur);
      const eased = t<0.5 ? 2*t*t : -1+(4-2*t)*t;
      node.textContent = String(Math.round(from + (to-from)*eased));
      if (t<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function updateCounters() {
    try {
      const els = pick();
      const total   = State.scanned || 0;
      const matched = (State.matchedList && State.matchedList.length) || 0;
      const st = (ns.DeepCampaign && ns.DeepCampaign.stats && ns.DeepCampaign.stats()) || { queued: 0, inFlight: 0 };
      tweenTo("total", total);
      tweenTo("matched", matched);
      if (els.dcQ) els.dcQ.textContent = String(st.queued || 0);
      if (els.dcA) els.dcA.textContent = String(st.inFlight || 0);
      const btn = document.getElementById("ep-btn-export-matches");
      if (btn) btn.disabled = matched<1;
    } catch (e) {
      console.warn("[UI] updateCounters:", e);
    }
  }

  function setStatus(msg) {
    const els = pick();
    if (els.status) els.status.textContent = String(msg || "");
    ns.UI && ns.UI.toast && ns.UI.toast(msg,"info");
  }

  function ensurePanel() { /* panel.js tekilliği sağlıyor */ }

  ns.UI = Object.assign(ns.UI || {}, { updateCounters, setStatus, ensurePanel });
})(window.EminPro = window.EminPro || {});

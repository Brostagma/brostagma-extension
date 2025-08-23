(function(ns){
  const { State, Util } = ns;

  async function _ensureDcIdle(){
    if (!State.DC_ENABLED) return;
    ns.UI?.setStatus?.("DC queue running… export will start when finished");
    ns.UI?.setProgressIndeterminate?.(true);
    await ns.DeepCampaign.waitUntilIdle(()=>{});
    ns.UI?.setProgressIndeterminate?.(false);
  }

  async function _runQuickPass(){ await ns.QuickScan.run(); }

  function _showSuspiciousAndWait(list){
    if (!list || list.length===0) return Promise.resolve(new Set());
    const ui = ns.UI?.ensurePrunePanel?.();
    if (!ui || !ui.show) return Promise.resolve(new Set());
    return new Promise((resolve)=>{
      ui.show(list, {
        onApply(keep){
          const keys = new Set((keep||[]).map(r=>r.key));
          resolve(keys);
        },
        onCancel(){ resolve(new Set()); }
      });
    });
  }

  function _buildRows(finalKeys){
    const finalSet = finalKeys && finalKeys.size ? new Set(finalKeys) : null;
    const rows = [];
    for (const rec of State.matchedList){
      const confident = (rec.score>=0.30) || (rec.brandSim>=0.85) || (rec.catOverlap>=2);
      const inSusp = finalSet ? finalSet.has(rec.key) : true;
      if (confident || inSusp){
        rows.push({
          Brand: rec.brand||"",
          Name: rec.name||rec.title||"",
          Price: rec.price||"",
          UnitPrice: rec.unitPrice||"",
          CampaignType: rec.campaignType||"",
          CampaignLabel: rec.campaignLabel||"",
          Link: rec.key,
          score: Util.round2(rec.score || 0),
          brandSim: Util.round2(rec.brandSim || 0),
          catOverlap: rec.catOverlap || 0,
          bestTargetId: rec.bestTargetId || ""
        });
      }
    }
    return rows;
  }

  function _downloadXlsx(rows){
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Matches");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    saveAs(blob, `eminpro-matches-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.xlsx`);
  }

  async function start(){
    if (State.exportPending) return;
    State.exportPending = true;
    try{
      ns.UI?.setStatus?.("Preparing export...");
      ns.UI?.setProgress?.(5);

      await _ensureDcIdle();             ns.UI?.setProgress?.(20);
      await _runQuickPass();             ns.UI?.setProgress?.(40);

      const suspicious = ns.QuickScan.buildSuspiciousList();
      ns.UI?.setProgress?.(60);

      const keepSet = await _showSuspiciousAndWait(suspicious);
      ns.UI?.setProgress?.(75);

      const rows = _buildRows(keepSet);  ns.UI?.setProgress?.(90);

      _downloadXlsx(rows);               ns.UI?.setProgress?.(100);
      ns.UI?.setStatus?.("Export completed.");
    }catch(err){
      console.error(err);
      ns.UI?.setStatus?.("Export failed.");
      alert("Export failed: " + (err && err.message || err));
    }finally{
      State.exportPending = false;
      setTimeout(()=>ns.UI?.setProgress?.(0), 800);
    }
  }

  ns.ExportXLSX = { start };
})(window.EminPro = window.EminPro || {});

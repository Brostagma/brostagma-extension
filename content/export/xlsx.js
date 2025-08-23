(function(ns){
  const { State } = ns;

  const ExportXLSX = {
    exportMatches(){
      if(!State.matchedList.length){ alert("Henüz eşleşen yok. Kaydırmaya devam edin veya yeniden deneyin."); return; }
      try{
        const rows=State.matchedList.map((x)=>({ Marka:x.brand||"", "Ürün Adı":x.name||"", "Fiyat (TL)":x.price??"", "Birim Fiyat (TL)":x.birim??"", "Kampanya Tipi":x.kampLabel||x.kampTipi||x.campaigns?.[0]||"", Link:x.href }));
        const wb=XLSX.utils.book_new();
        const ws=XLSX.utils.json_to_sheet(rows,{header:["Marka","Ürün Adı","Fiyat (TL)","Birim Fiyat (TL)","Kampanya Tipi","Link"]});
        XLSX.utils.book_append_sheet(wb,ws,"Eşleşenler");
        const range=XLSX.utils.decode_range(ws["!ref"]); const linkCol=5;
        for(let r=range.s.r+1,i=0;r<=range.e.r;r++,i++){
          const url=rows[i]?.Link; if(!url) continue;
          const addr=XLSX.utils.encode_cell({r,c:linkCol}); ws[addr]={t:"s",v:"Ürüne Git",l:{Target:String(url)}};
          const nameAddr=XLSX.utils.encode_cell({r,c:1}); if(ws[nameAddr]) ws[nameAddr].l={Target:String(url)};
        }
        const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
        const now=new Date();
        const dd=String(now.getDate()).padStart(2,"0"), mm=String(now.getMonth()+1).padStart(2,"0"), yy=String(now.getFullYear()).slice(-2),
              HH=String(now.getHours()).padStart(2,"0"), MM=String(now.getMinutes()).padStart(2,"0");
        const fname=`${dd}.${mm}.${yy} - ${HH}.${MM} - ${State.matchedList.length} eslesme.xlsx`;
        saveAs(new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), fname);
      }catch(e){
        alert("XLSX oluşturulamadı: " + (e?.message || e));
      }
    },
    exportTargets(){
      if(!State.TARGETS.length){ alert("Önce XLSX hedef listesini yükleyin."); return; }
      const rows=State.TARGETS.map((t)=>({ Marka:t.brand||"", Ürün:t.name||"", Kategori:t.category||"" }));
      const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(rows,{header:["Marka","Ürün","Kategori"]}); XLSX.utils.book_append_sheet(wb,ws,"Hedefler");
      const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
      saveAs(new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"hedef-listesi-ayiklanan.xlsx");
    }
  };

  ns.ExportXLSX = ExportXLSX;
})(window.EminPro = window.EminPro || {});

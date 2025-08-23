/* State — paylaşılan durum */
(function(ns){
  ns.State = Object.assign(ns.State||{}, {
    gridRoot: null,
    scanned: 0,
    matchedList: [],
    ui: null
  });
})(window.EminPro = window.EminPro || {});

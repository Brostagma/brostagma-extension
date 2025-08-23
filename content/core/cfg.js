/* CFG — v3.9.5 uyumlu sözleşme (seçiciler, pref anahtarları, DC ayarları) */
(function(ns){
  const CFG = ns.CFG || {};

  CFG.UI = Object.assign({
    VERSION: "v3.9.5-mv3",
    Z: 2147483647,
    MIN_WIDTH: 320
  }, CFG.UI||{});

  CFG.PREF = Object.assign({
    PANEL_POS: "eminpro_v395_panel_pos",
    PANEL_SIZE: "eminpro_v395_panel_size",
    PANEL_COLLAPSE: "eminpro_v395_panel_collapsed",
    DC_ENABLED: "eminpro_v395_dc_enabled",
    ALLOW_SIMILAR: "eminpro_v395_allow_similar",
    STEP: "eminpro_v395_scroll_step",
    DELAY: "eminpro_v395_scroll_delay",
    CAMP_FILTERS: "eminpro_v395_camp_filters"
  }, CFG.PREF||{});

  CFG.SELECTOR = Object.assign({
    GRID_CANDIDATE: '[data-testid="search-results"], main, body',
    CARD: '[data-testid*="product-card"], .p-card-wrppr, [data-product-id]',
    LINK_IN_CARD: 'a[href*="-p-"], a[href*="/sr?"]',
    TITLE_IN_CARD: 'h3[data-testid*="product"], .prdct-desc-cntnr-name, h3',
    PRICE_IN_CARD: '[data-testid="price-current-price"], .prc-box-dscntd, .prc-box-orgnl'
  }, CFG.SELECTOR||{});

  CFG.DEF = Object.assign({ STEP: 500, DELAY: 800 }, CFG.DEF||{});

  CFG.DC = Object.assign({
    CONCURRENCY: 2,
    DELAY_MIN_MS: 350,
    DELAY_MAX_MS: 850,
    COOLDOWN_MS: 5000
  }, CFG.DC||{});

  ns.CFG = CFG;
})(window.EminPro = window.EminPro || {});

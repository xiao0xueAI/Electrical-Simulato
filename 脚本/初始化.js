// ==================== Section 15: Init ====================
// 前台界面开关：键名与 数据/产品库.js 的 QIACHIP.uiConfig 一一对应，
// 值为该开关关闭时要隐藏的元素选择器列表。
const UI_FLAG_FEATURES = {
  uploadProduct: ['.product-btn', '#productModal'], // 顶部「上传产品」按钮 + 上传弹窗
  importJSON: ['[data-feature="importJSON"]'],       // 文件菜单「导入JSON」
  exportJSON: ['[data-feature="exportJSON"]'],       // 文件菜单「导出JSON」
  saveBrowser: ['[data-feature="saveBrowser"]'],      // 文件菜单「保存到/从浏览器加载」
  templates: ['[data-feature="templates"]', '#tabTemplates'] // 左侧栏「电路模板」标签 + 内容
};

// 按 QIACHIP.uiConfig[0] 隐藏被关闭的界面。未配置或缺失的键默认显示（true）。
// 优先读 localStorage 缓存（index.html head 段注入），fallback 到 QIACHIP.uiConfig。
function applyUIFlags() {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('elecsim_uiconfig') || 'null'); } catch(e){}
  if (!cfg) cfg = (window.QIACHIP && QIACHIP.uiConfig && QIACHIP.uiConfig[0]) || {};
  for (const key in UI_FLAG_FEATURES) {
    const enabled = cfg[key] !== false;
    UI_FLAG_FEATURES[key].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.display = enabled ? '' : 'none';
    });
  }
}

function init() {
  // Preload bell audio early so it's ready when simulation starts
  BellAudio.preload();
  // Preload all component images into shared cache (no per-component reload)
  Registry.preloadAllImages();

  // Build component library UI
  buildLibrary();
  // Init QIACHIP products
  QIACHIP.init();
  QIACHIP.buildProductList();
  QIACHIP.initEditor();
  // Build templates list
  Templates.buildTemplateList();
  // 应用「前台界面开关」：按 数据/产品库.js 的 QIACHIP.uiConfig 隐藏被关闭的界面
  applyUIFlags();
  // Apply initial recBg visual state
  UI.setRecBg(S.recBg);
  // Setup canvas
  resize();
  // Init events
  initEvents();
  // Start auto-save
  Persistence.startAutoSave();

  // Start with empty canvas (no default template)
  UI.toast('就绪 | 从左侧元件库拖放元件，或从模板库加载', 'success');
}

function buildLibrary() {
  const list = document.getElementById('compList');
  list.innerHTML = '';

  // Built-in components by category
  const cats = Registry.getByCategory();
  cats.forEach(cat => {
    const catEl = document.createElement('div');
    catEl.className = 'comp-cat';
    catEl.style.color = Config.categoryColors[cat.cat] || '#8b949e';
    catEl.textContent = cat.cat;
    list.appendChild(catEl);

    cat.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'comp-item';
      el.draggable = true;
      el.innerHTML = `<div class="comp-icon">${item.icon}</div><div class="comp-info"><div class="comp-name">${item.name}</div><div class="comp-desc">${item.desc}</div></div>`;
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify(item));
      });
      el.addEventListener('dblclick', () => {
        Renderer.addComponent(item, W / 2 / S.zoom - S.pan.x / S.zoom, H / 2 / S.zoom - S.pan.y / S.zoom);
      });
      list.appendChild(el);
    });
  });

  // Custom/QIACHIP components (if any extra)
  const qiachipDefs = QIACHIP.getAsDefs();
  if (qiachipDefs.length > 0) {
    const catEl = document.createElement('div');
    catEl.className = 'comp-cat';
    catEl.style.color = Config.categoryColors['QIACHIP产品'];
    catEl.textContent = 'QIACHIP产品';
    list.appendChild(catEl);

    qiachipDefs.forEach(item => {
      const el = document.createElement('div');
      el.className = 'comp-item';
      el.draggable = true;
      el.innerHTML = `<div class="comp-icon">${item.icon || '📡'}</div><div class="comp-info"><div class="comp-name">${item.name}</div><div class="comp-desc">${item.desc}</div></div>`;
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify(item));
      });
      el.addEventListener('dblclick', () => {
        Renderer.addComponent(item, W / 2 / S.zoom - S.pan.x / S.zoom, H / 2 / S.zoom - S.pan.y / S.zoom);
      });
      list.appendChild(el);
    });
  }
}

// ==================== Public API ====================
// 创建命名空间（保持 onclick 处理器兼容）
window.ElecSim = {
  Config, S, Registry, QIACHIP, Renderer, WireRouter, Engine, History, Persistence, Templates, Recorder, UI,
  init, requestRender, markStaticDirty, resize, zoomToFit
};

// Global aliases for onclick handlers in HTML
window.render = () => ElecSim.requestRender();
window.markStaticDirty = () => ElecSim.markStaticDirty();

// Boot
document.addEventListener('DOMContentLoaded', () => ElecSim.init());

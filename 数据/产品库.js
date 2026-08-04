// ==================== Section 4: QIACHIP Product System ====================
const QIACHIP = {
  products: [],
  editorPins: [],
  editorImage: null,

  // 前台界面开关：由可视化编辑器「前台开关」页写入，前台 init 时读取并隐藏对应界面。
  // 默认全部为 true（显示）。可视化编辑器里取消勾选即变为 false（隐藏）。
  // 键名与 脚本/初始化.js 的 UI_FLAG_FEATURES 映射一一对应。
  uiConfig: [
  {
      uploadProduct: false,
      importJSON: true,
      exportJSON: true,
      saveBrowser: true,
      templates: true
    },
  ],

  templates: [
  {
      id: 'rf_remote',
      type: 'rf_remote',
      name: '433MHz 1键遥控器',
      model: 'RF-1KEY',
      desc: '433MHz单键无线遥控器A键（信号发射器, 配433MHz控制器使用）',
      cat: '无线遥控',
      icon: '📱',
      w: 200,
      h: 273,
      image: 'images/rf_remote_关闭.webp',
      imageOn: 'images/rf_remote_打开.webp',
      signalImage: 'images/rf_signal.webp',
      pins: [],
      buttons: [
        {
          label: '键1',
          x: -39,
          y: -31,
          w: 50,
          h: 50,
          channel: 'A'
        }
      ],
      specs: {
        frequency: '433MHz',
        channel: 'A'
      },
      props: {
        freq: 433,
        channel: 'A',
        pressed: false
      },
      behavior: 'remote'
    },
    {
      id: 'rf_remote_2key',
      type: 'rf_remote_2key',
      name: '433MHz 2键遥控器',
      model: 'RF-2KEY',
      desc: '433MHz两键无线遥控器（ON/OFF双键，配433MHz控制器使用）',
      cat: '无线遥控',
      icon: '📱',
      w: 200,
      h: 273,
      image: 'images/rf_remote_2key.webp',
      imageOn: 'images/rf_remote_2key_on.webp',
      signalImage: 'images/rf_signal.webp',
      pins: [],
      specs: {
        frequency: '433MHz',
        channels: 2
      },
      props: {
        freq: 433,
        pressed1: false,
        pressed2: false
      },
      behavior: 'remote',
      buttons: [
        {
          label: '键1',
          x: -39,
          y: -75,
          w: 50,
          h: 50,
          channel: 'A',
          shape: 'rect'
        },
        {
          label: '键2',
          x: -38,
          y: -14,
          w: 50,
          h: 50,
          channel: 'B',
          shape: 'rect'
        }
      ]
    },
    {
      id: 'custom_1785720495535',
      type: 'bt_relay',
      name: 'KR0550-1CH',
      model: 'KR0550-1CH',
      desc: '米家蓝牙mesh干接点模块（信号接收器器, 配蓝牙mes遥控器使用）',
      cat: 'QIACHIP产品',
      icon: '📡',
      w: 320,
      h: 140,
      image: 'images/KR0550.webp',
      imageOn: '',
      signalImage: '',
      behavior: 'relay',
      specs: {},
      props: {
        mode: 'toggle'
      },
      pins: [
        {
          id: 'pin0',
          label: 'V+',
          dx: 139,
          dy: -53,
          lo: 31,
          ld: 0,
          fs: 22,
          lp: 'right',
          type: 'coil',
          color: '#ff0000',
          labelColor: '#ff0000'
        },
        {
          id: 'pin1',
          label: 'V-',
          dx: 139,
          dy: -26,
          lo: 28,
          ld: 0,
          fs: 22,
          lp: 'custom',
          type: 'coil',
          color: '#00aaff',
          labelColor: '#00bfff'
        },
        {
          id: 'pin2',
          label: 'COM',
          dx: -141,
          dy: -24,
          lo: -35,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin3',
          label: 'NO',
          dx: -141,
          dy: 0,
          lo: -35,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin4',
          label: 'NC',
          dx: -141,
          dy: 25,
          lo: -35,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        }
      ],
      pinRadius: 8.5
    },
    {
      id: 'custom_1785743156613',
      type: '',
      name: 'KR1201A',
      model: 'KR1201A',
      desc: '433MHz 干接点模块（信号接收器, 配433MHz遥控器使用）',
      cat: 'QIACHIP产品',
      icon: '📡',
      w: 300,
      h: 200,
      image: 'images/KR1201A.webp',
      imageOn: '',
      signalImage: '',
      behavior: 'relay',
      specs: {
        voltage: 12,
        voltageType: 'DC',
        voltageUnit: 'V'
      },
      props: {},
      pins: [
        {
          id: 'pin0',
          label: 'V-',
          dx: -106,
          dy: -57,
          lo: -30,
          ld: 0,
          fs: 22,
          lp: 'custom',
          type: 'coil',
          color: '#00bfff',
          labelColor: '#00bfff'
        },
        {
          id: 'pin1',
          label: 'V+',
          dx: -105,
          dy: -23,
          lo: -30,
          ld: 0,
          fs: 22,
          lp: 'custom',
          type: 'coil',
          color: '#ff0000',
          labelColor: '#ff0000'
        },
        {
          id: 'pin2',
          label: 'NO',
          dx: -106,
          dy: 10,
          lo: -31,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin3',
          label: 'COM',
          dx: -106,
          dy: 45,
          lo: -40,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin4',
          label: 'NC',
          dx: -108,
          dy: 78,
          lo: -31,
          ld: 0,
          fs: 20,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        }
      ],
      pinRadius: 8.5
    },
    {
      id: 'dry_relay',
      type: 'dry_relay',
      name: 'KR2201-COM',
      model: 'KR2201-COM',
      desc: '433MHz无线10A干接点1CH AC110V/220V（实物照片）',
      cat: '继电器/接触器',
      icon: '📡',
      w: 320,
      h: 200,
      image: 'images/dry_relay.webp',
      pins: [
        {
          id: 'pin0',
          label: 'L',
          dx: 135,
          dy: -20,
          lo: 20,
          ld: 0,
          fs: 0,
          lp: 'custom',
          type: 'coil',
          color: '#ff0000',
          labelColor: '#ff0000'
        },
        {
          id: 'pin1',
          label: 'N',
          dx: 135,
          dy: 12,
          lo: 20,
          ld: 0,
          fs: 0,
          lp: 'custom',
          type: 'coil',
          color: '#00bfff',
          labelColor: '#00bfff'
        },
        {
          id: 'pin2',
          label: 'NO',
          dx: -135,
          dy: -38,
          lo: -33,
          ld: 0,
          fs: 0,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin3',
          label: 'COM',
          dx: -135,
          dy: -4,
          lo: -44,
          ld: 0,
          fs: 0,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        },
        {
          id: 'pin4',
          label: 'NC',
          dx: -135,
          dy: 26,
          lo: -33,
          ld: 0,
          fs: 0,
          lp: 'custom',
          type: 'contact',
          color: '',
          labelColor: ''
        }
      ],
      specs: {
        frequency: '433MHz',
        channels: 1,
        relayRating: '10A'
      },
      props: {
        coilVoltage: 220,
        coilResistance: 500,
        contactR: 0.02,
        maxCurrent: 10,
        rfFreq: 433,
        channels: 1,
        mode: 'none',
        pairedRemote: null,
        lastSignal: 0,
        lastSignalOn: false,
        energized: false
      },
      behavior: 'relay',
      imageOn: '',
      signalImage: ''
    },
    {
      id: 'custom_1785741296725',
      type: 'bt_remote',
      name: '米家APP蓝牙mesh遥控器',
      model: '',
      desc: '米家蓝牙mesh无线遥控器（信号发射器, 配蓝牙mesh控制器使用）',
      cat: '无线遥控',
      icon: '📱',
      w: 250,
      h: 390,
      image: 'images/手机控制蓝牙信号关闭.webp',
      imageOn: 'images/手机控制蓝牙信号开启.webp',
      signalImage: '',
      behavior: 'remote',
      specs: {},
      props: {},
      pins: [],
      buttons: [
        {
          label: '键1',
          x: 0,
          y: -83,
          w: 188,
          h: 144,
          channel: 'A',
          shape: 'rect'
        },
        {
          label: '键2',
          x: -51,
          y: 47,
          w: 95,
          h: 38,
          channel: 'B',
          shape: 'rect'
        },
        {
          label: '键3',
          x: 53,
          y: 47,
          w: 96,
          h: 39,
          channel: 'C',
          shape: 'rect'
        }
      ],
      pressMode: 'toggle'
    },
  ],

  init() {
    // Load from localStorage or use templates
    // Version check: clear old cache when pin layout changes
    const PIN_LAYOUT_VERSION = 60;
    try {
      const cachedVer = localStorage.getItem('elecsim_pin_layout_ver');
      if (cachedVer !== String(PIN_LAYOUT_VERSION)) {
        localStorage.removeItem('elecsim_v2_products');
        localStorage.setItem('elecsim_pin_layout_ver', String(PIN_LAYOUT_VERSION));
      }
    } catch(e) {}
    try {
      const saved = localStorage.getItem('elecsim_v2_products');
      if (saved) { this.products = JSON.parse(saved); return; }
    } catch(e) {}
    // Default: load templates as products
    this.products = this.templates.map(t => ({...t, image: null}));
    this.save();
  },

  save() {
    try { localStorage.setItem('elecsim_v2_products', JSON.stringify(this.products)); } catch(e) {}
  },

  getAsDefs() {
    return this.products.map(p => ({
      type: p.type || ('product_' + (p.id || p.model)),
      name: p.name, cat: p.cat || 'QIACHIP产品', icon: p.icon || '📡',
      desc: p.model || p.desc || '', w: p.w || 140, h: p.h || 90,
      pins: p.pins || [], pinRadius: p.pinRadius,
      buttons: p.buttons || [],
      pressMode: p.pressMode || 'momentary',
      props: { ...(p.specs || {}), ...(p.props || {}), behavior: p.behavior || 'blackbox', energized: false },
      image: p.image || null,
      imageOn: p.imageOn || null,
      signalImage: p.signalImage || null
    }));
  },

  buildProductList() {
    const list = document.getElementById('productList');
    if (!list) return;
    list.innerHTML = '';
    const allProducts = [...this.templates, ...this.products.filter(p => !this.templates.find(t => t.id === p.id))];
    allProducts.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.draggable = true;
      card.innerHTML = `
        <div class="prod-img">${p.image ? `<img src="${p.image}" alt="">` : (p.icon || '📡')}</div>
        <div class="prod-info">
          <div class="prod-name">${p.name}</div>
          <div class="prod-model">${p.model || ''} | ${(p.specs || {}).frequency || ''}</div>
        </div>`;
      const def = {
        type: p.type || ('product_' + (p.id || p.model)),
        name: p.name, cat: p.cat || 'QIACHIP产品', icon: p.icon || '📡',
        desc: p.model || p.desc || '', w: p.w || 140, h: p.h || 90,
        pins: p.pins || [],
        buttons: p.buttons || [],
        props: { ...(p.specs || {}), ...(p.props || {}), behavior: p.behavior || 'blackbox', energized: false },
        image: p.image || null,
        imageOn: p.imageOn || null,
        signalImage: p.signalImage || null
      };
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify(def)); });
      card.addEventListener('dblclick', () => {
        Renderer.addComponent(def, W / 2 / S.zoom - S.pan.x / S.zoom, H / 2 / S.zoom - S.pan.y / S.zoom);
      });
      list.appendChild(card);
    });
  },

  initEditor() {
    const canvas = document.getElementById('pinEditorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const handleImage = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          QIACHIP.editorImage = img;
          QIACHIP.drawEditor();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    document.getElementById('prodImage').addEventListener('change', handleImage);

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pinId = 'pin_' + this.editorPins.length;
      this.editorPins.push({ id: pinId, label: pinId.toUpperCase(), dx: Math.round(x), dy: Math.round(y) });
      this.drawEditor();
      this.updateEditorPinsList();
    });
  },

  drawEditor() {
    const canvas = document.getElementById('pinEditorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.editorImage) {
      const scale = Math.min(canvas.width / this.editorImage.width, canvas.height / this.editorImage.height, 1);
      const w = this.editorImage.width * scale;
      const h = this.editorImage.height * scale;
      ctx.drawImage(this.editorImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#484f58';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('上传产品图片后在此添加引脚', canvas.width / 2, canvas.height / 2);
    }

    // Draw pins
    this.editorPins.forEach((pin, i) => {
      ctx.fillStyle = '#ff7eb3';
      ctx.strokeStyle = '#ff7eb3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pin.dx, pin.dy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c9d1d9';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(pin.label, pin.dx, pin.dy - 12);
    });
  },

  updateEditorPinsList() {
    const el = document.getElementById('pinEditorPins');
    if (!el) return;
    if (this.editorPins.length === 0) {
      el.textContent = '暂无引脚，点击画布添加';
      return;
    }
    el.innerHTML = this.editorPins.map((p, i) =>
      `<span style="display:inline-block;background:rgba(255,126,179,.1);border:1px solid var(--pink);border-radius:3px;padding:1px 6px;margin:2px;font-size:10px;color:var(--pink);">${p.label} <span style="cursor:pointer;color:var(--red);" onclick="ElecSim.QIACHIP.removeEditorPin(${i})">&times;</span></span>`
    ).join('');
  },

  removeEditorPin(index) {
    this.editorPins.splice(index, 1);
    this.drawEditor();
    this.updateEditorPinsList();
  },

  clearEditor() {
    this.editorPins = [];
    this.editorImage = null;
    this.drawEditor();
    this.updateEditorPinsList();
    document.getElementById('prodName').value = '';
    document.getElementById('prodModel').value = '';
    document.getElementById('prodDesc').value = '';
    document.getElementById('prodSpecs').value = '{}';
  },

  addProduct() {
    const name = document.getElementById('prodName').value.trim();
    if (!name) { UI.toast('请输入产品名称', 'error'); return; }
    const model = document.getElementById('prodModel').value.trim();
    const desc = document.getElementById('prodDesc').value.trim();
    const behavior = document.getElementById('prodBehavior').value;
    let specs = {};
    try { specs = JSON.parse(document.getElementById('prodSpecs').value || '{}'); } catch(e) { UI.toast('JSON格式错误', 'error'); return; }

    const canvas = document.getElementById('pinEditorCanvas');
    const scaleX = this.editorImage ? this.editorImage.width / canvas.width : 1;
    const scaleY = this.editorImage ? this.editorImage.height / canvas.height : 1;

    const pins = this.editorPins.map(p => ({
      id: p.label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: p.label,
      dx: Math.round((p.dx - canvas.width / 2) / scaleX * 0.5),
      dy: Math.round((p.dy - canvas.height / 2) / scaleY * 0.5)
    }));

    const product = {
      id: 'custom_' + Date.now(),
      name, model, desc,
      icon: '📡', w: 140, h: 90,
      pins, specs, behavior,
      image: this.editorImage ? this.editorImage.src : null
    };

    this.products.push(product);
    this.save();
    this.buildProductList();
    UI.closeModal('productModal');
    UI.toast('已添加产品: ' + name, 'success');
    this.clearEditor();
  }
};


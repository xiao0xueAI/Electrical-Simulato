const canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let _mainCtx = ctx; // preserve reference to main canvas context
let W, H;

// ==================== Offscreen canvas for static layers ====================
// Caches grid + wires + components (without selection glow or current flow).
// Only rebuilt when _staticDirty is true (scene change, pan/zoom, resize).
let _staticCanvas = null;
let _staticCtx = null;
let _staticDirty = true;
let _drawingStatic = false; // when true, drawComponents skips selection glow

// ==================== Frame rate control ====================
// 30fps cap during simulation (electrical quantities don't need 60Hz).
// When idle (not simulating), render only on demand (dirty flag).
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let _lastFrameTime = 0;
let _renderPending = false;

function requestRender() {
  if (!_renderPending) {
    _renderPending = true;
    requestAnimationFrame(_doRender);
  }
}

function _doRender(ts) {
  _renderPending = false;
  // Throttle to 30fps during simulation
  if (Engine.running) {
    if (ts - _lastFrameTime < FRAME_INTERVAL) {
      requestRender();
      return;
    }
    _lastFrameTime = ts;
  }
  _SR_render();
}

// Mark the static layer as dirty — call when scene changes
// (component add/remove/move, wire add/remove, pan/zoom, component props change)
function markStaticDirty() {
  _staticDirty = true;
  requestRender();
}

// 调色辅助：把十六进制颜色按比例 f(0~1) 加深，用于端子描边
function shadeHex(hex, f) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.round(r * (1 - f)));
  g = Math.max(0, Math.round(g * (1 - f)));
  b = Math.max(0, Math.round(b * (1 - f)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function resize() {
  const r = window.devicePixelRatio || 1;
  const area = document.getElementById('canvasArea');
  W = area.clientWidth; H = area.clientHeight;
  canvas.width = W * r; canvas.height = H * r;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(r, 0, 0, r, 0, 0);
  // Set image smoothing once globally (not per drawImage call)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Rebuild offscreen canvas
  _staticCanvas = document.createElement('canvas');
  _staticCanvas.width = canvas.width;
  _staticCanvas.height = canvas.height;
  _staticCtx = _staticCanvas.getContext('2d');
  _staticCtx.setTransform(r, 0, 0, r, 0, 0);
  _staticCtx.imageSmoothingEnabled = true;
  _staticCtx.imageSmoothingQuality = 'high';
  _staticDirty = true;
  requestRender();
}
window.addEventListener('resize', resize);

function screenToCanvas(sx, sy) {
  return { x: (sx - S.pan.x) / S.zoom, y: (sy - S.pan.y) / S.zoom };
}

// _SR_render: direct synchronous render (used by animation loop & recording only)
function _SR_render() { Renderer.render(); }

const Renderer = {
  render() {
    try {
    S.animTick++;

    // Recording / Export mode: render directly with chosen background color
    if (S.recording) {
      ctx.clearRect(0, 0, W, H);
      const isWhite = S.recBg === 'white';
      ctx.fillStyle = isWhite ? '#ffffff' : '#0d1117';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(S.pan.x, S.pan.y);
      ctx.scale(S.zoom, S.zoom);
      // Grid: only on dark background (white = clean product diagram, no grid)
      if (!isWhite) {
        const g = S.grid;
        const startX = Math.floor(-S.pan.x / S.zoom / g) * g;
        const startY = Math.floor(-S.pan.y / S.zoom / g) * g;
        const endX = startX + W / S.zoom + g * 2;
        const endY = startY + H / S.zoom + g * 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = startX; x < endX; x += g) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
        for (let y = startY; y < endY; y += g) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
        ctx.stroke();
      }
      WireRouter.drawWires();
      this.drawComponents();
      if (WireRouter.isActive()) WireRouter.drawTempWire();
      ctx.restore();
      // Pin labels drawn LAST → topmost layer (never covered by wires/temp wire)
      this.drawPinLabels();
      this.updateCounts();
      return;
    }

    // Normal mode: use offscreen canvas for static layers
    if (_staticDirty || !_staticCanvas) {
      this._rebuildStatic();
      _staticDirty = false;
    }

    // Fast path: draw cached static layer + dynamic overlay
    ctx.clearRect(0, 0, W, H);
    // 1. Blit cached static scene (grid + wires + components)
    ctx.drawImage(_staticCanvas, 0, 0, W, H);

    // 2. Dynamic overlay: current flow animation + selection glow + temp wire
    const hasAnimation = Engine.running && S.showCurrentDir;
    const hasTempWire = WireRouter.isActive();
    const hasSelection = S.selected !== null;

    if (hasAnimation || hasTempWire || hasSelection) {
      ctx.save();
      ctx.translate(S.pan.x, S.pan.y);
      ctx.scale(S.zoom, S.zoom);

      // Current flow animation (only on wires with current > 0)
      if (hasAnimation) {
        this._drawCurrentFlowOverlay();
      }

      // Selection highlight (lightweight outline, no shadowBlur)
      if (hasSelection) {
        this._drawSelectionOverlay();
      }

      // Temp wire during wiring
      if (hasTempWire) {
        WireRouter.drawTempWire();
      }

      ctx.restore();
    }

    // Pin labels drawn LAST → topmost layer (never covered by wires/current-flow)
    this.drawPinLabels();

    this.updateCounts();
    } catch(e) {
      // Defensive: don't let a single bad render kill the animation loop
      console.error('[ElecSim] Render error:', e);
    }
  },

  // ==================== Rebuild static layer (offscreen canvas) ====================
  // Draws: grid + wires (pipes, crimps, joints) + components (images, pins)
  // Called only when _staticDirty is true.
  _rebuildStatic() {
    const sctx = _staticCtx;
    sctx.clearRect(0, 0, W, H);
    sctx.save();
    sctx.translate(S.pan.x, S.pan.y);
    sctx.scale(S.zoom, S.zoom);

    // Grid
    const g = S.grid;
    const startX = Math.floor(-S.pan.x / S.zoom / g) * g;
    const startY = Math.floor(-S.pan.y / S.zoom / g) * g;
    const endX = startX + W / S.zoom + g * 2;
    const endY = startY + H / S.zoom + g * 2;
    sctx.strokeStyle = 'rgba(255,255,255,0.04)';
    sctx.lineWidth = 0.5;
    sctx.beginPath();
    for (let x = startX; x < endX; x += g) { sctx.moveTo(x, startY); sctx.lineTo(x, endY); }
    for (let y = startY; y < endY; y += g) { sctx.moveTo(startX, y); sctx.lineTo(endX, y); }
    sctx.stroke();

    // Swap global ctx to static context so drawWires/drawComponents draw offscreen
    ctx = sctx;
    _drawingStatic = true;
    WireRouter.drawWires();
    this.drawComponents();
    _drawingStatic = false;
    ctx = _mainCtx; // restore

    sctx.restore();
  },

  // ==================== Draw current flow animation (dynamic overlay) ====================
  _drawCurrentFlowOverlay() {
    // Only draw the animated current flow on top of cached wires
    S.wires.forEach(w => {
      if (w.current <= 0) return; // skip wires with no current
      const eps = WireRouter._getWireEndpoints(w);
      if (!eps) return;
      const [p1, p2] = eps;
      const allPoints = [p1, ...(w.waypoints || []), p2];
      const wt = w.wireType || 'live';
      const flowColor = WireRouter.WireColors[wt] || '#e53935';
      WireRouter.drawCurrentFlow(allPoints, w.current, flowColor, w);
    });
  },

  // ==================== Draw selection highlight (dynamic overlay) ====================
  _drawSelectionOverlay() {
    const c = S.components.find(c => c.id === S.selected);
    if (!c) return;
    // 遥控器不需要选中框：点击按键触发时会遮挡实物照片，影响操作
    if (c.type === 'rf_remote' || c.type === 'bt_remote' || c.type === 'rf_remote_2key') return;
    const bw = c.w || 100, bh = c.h || 56;
    const catColor = Config.categoryColors[c.cat] || '#58a6ff';
    // Lightweight dashed outline instead of expensive shadowBlur
    ctx.save();
    ctx.strokeStyle = catColor;
    ctx.lineWidth = 2 / S.zoom;
    ctx.setLineDash([6 / S.zoom, 3 / S.zoom]);
    ctx.lineJoin = 'round';
    const pad = 4 / S.zoom;
    ctx.strokeRect(c.x - bw/2 - pad, c.y - bh/2 - pad, bw + pad*2, bh + pad*2);
    ctx.setLineDash([]);
    ctx.restore();
  },

  drawGrid() {
    const g = S.grid;
    const startX = Math.floor(-S.pan.x / S.zoom / g) * g;
    const startY = Math.floor(-S.pan.y / S.zoom / g) * g;
    const endX = startX + W / S.zoom + g * 2;
    const endY = startY + H / S.zoom + g * 2;
    const isXray = false;

    ctx.strokeStyle = isXray ? 'rgba(57,210,192,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = startX; x < endX; x += g) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
    for (let y = startY; y < endY; y += g) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
    ctx.stroke();

    // 放大视图时叠加更细的次级网格（grid/2），提升精细对齐观感；
    // 仅在 zoom>=1.5 时绘制，避免普通视图下线条过密影响性能与观感。
    if (S.zoom >= 1.5) {
      const sg = g / 2;
      const sStartX = Math.floor(-S.pan.x / S.zoom / sg) * sg;
      const sStartY = Math.floor(-S.pan.y / S.zoom / sg) * sg;
      const sEndX = sStartX + W / S.zoom + sg * 2;
      const sEndY = sStartY + H / S.zoom + sg * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = sStartX; x < sEndX; x += sg) { ctx.moveTo(x, sStartY); ctx.lineTo(x, sEndY); }
      for (let y = sStartY; y < sEndY; y += sg) { ctx.moveTo(sStartX, y); ctx.lineTo(sEndX, y); }
      ctx.stroke();
    }

    if (isXray) {
      ctx.strokeStyle = 'rgba(57,210,192,0.1)';
      ctx.beginPath();
      for (let x = startX; x < endX; x += g * 5) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y < endY; y += g * 5) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
    }
  },

  drawComponents() {
    S.components.forEach(c => {
      const sel = !_drawingStatic && S.selected === c.id;
      const catColor = Config.categoryColors[c.cat] || '#8b949e';
      const isXray = false;

      ctx.save();
      ctx.translate(c.x, c.y);

      const bw = c.w || 100, bh = c.h || 56;

      // === AC SOURCE: custom layout (plug image at top, lead wires + pins at bottom) ===
      if (c.type === 'ac_source' && c.image) {
        const imgAR = 396 / 600;  // webp actual aspect ratio (396x600)
        const plugW = bw;
        const plugH = plugW / imgAR;
        const plugTopY = -bh / 2;
        const plugBottomY = plugTopY + plugH;
        // Cable exits at x≈275 in 396-wide image (not image center 198!)
        // Offset the DRAW so the cable aligns with component center, not the whole image
        const cableFrac = 275 / 396;  // cable X in image coords (fraction)
        const cableOffsetX = (cableFrac - 0.5) * plugW;
        // Selection glow
        if (sel) { ctx.shadowColor = catColor; ctx.shadowBlur = 14; }
        try {
          const cacheKey = '_imgCache';
          let img = c[cacheKey];
          if (!img || img.src !== c.image) {
            img = Registry.preloadImage(c.image);
            c[cacheKey] = img;
          }
          if (img.complete && img.naturalWidth > 0) {
            ctx.globalAlpha = isXray ? 0.3 : 1.0;
            // Shift image LEFT by cableOffsetX so the CABLE lands at x=0 (component center)
            ctx.drawImage(img, -plugW / 2 - cableOffsetX, plugTopY, plugW, plugH);
            ctx.globalAlpha = 1;
          }
        } catch(e) {}
        // Pins centered on cable (now at x=0 after offset)
        ctx.restore();
        this._drawPinsForComponent(c);
        return;
      }

      // === IMAGE-BASED COMPONENTS (frameless realist style) ===
      if (c.image) {
        // Selection glow
        if (sel) { ctx.shadowColor = catColor; ctx.shadowBlur = 14; }

        // Draw image full-bleed (no dark box, no padding) — with SHARED image cache
        try {
          const lampLit = c.type === 'lamp' && S.simRunning && c.simCurrent > 0;
          // 亮度随实际功率变化：brightness ∝ (I/Ir)^2，Ir=额定功率对应电流
          let lampBright = 1;
          if (lampLit) {
            const Ir = (c.props.wattage || 60) / (c.props.voltage || 220); // 额定电流 A
            const I_A = (c.simCurrent || 0) / 1000;
            lampBright = Math.max(0, Math.min((I_A / Ir) * (I_A / Ir), 1));
          }
          const remote2kLit = c.type === 'rf_remote_2key' && (c.props.pressed1 || c.props.pressed2);
          const drySignalOn = c.type === 'dry_signal' && c.props.energized;
          const remoteBtnLit = (c.type === 'rf_remote' || c.type === 'bt_remote') && c.buttons && c.props.pressedButtons && c.props.pressedButtons.some(Boolean);
          const wantOn = (c.props.closed || c.props.pressed || lampLit || remote2kLit || drySignalOn || remoteBtnLit) && c.imageOn;
          const imgSrc = wantOn ? c.imageOn : c.image;
          const cacheKey = wantOn ? '_imgOnCache' : '_imgCache';
          let img = c[cacheKey];
          if (!img || img.src !== imgSrc) {
            // Use shared Registry cache so component placement is instant
            // (no new Image() per component, no reload from network)
            img = Registry.preloadImage(imgSrc);
            c[cacheKey] = img;
          }
          if (img.complete && img.naturalWidth > 0) {
            ctx.globalAlpha = isXray ? 0.3 : (lampLit ? (0.4 + 0.6 * lampBright) : 1.0);
            // Preserve natural aspect ratio (fit inside bw x bh)
            const imgAR = img.naturalWidth / img.naturalHeight;
            const boxAR = bw / bh;
            let drawW, drawH;
            if (imgAR > boxAR) {
              drawW = bw;
              drawH = bw / imgAR;
            } else {
              drawH = bh;
              drawW = bh * imgAR;
            }
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.globalAlpha = 1;
          }
        } catch(e) {}

        // === 12V电池: 主体居中，引线从端子球引到pin ===
        if (c.type === 'battery_12v' && c.pins && c.pins.length >= 2) {
          // 主体bbox (相对原图): x=[293,1814] y=[791,1656], 主体宽1522, 高866
          // 主体AR ≈ 1.758
          const bodyW = bw;
          const bodyH = bodyW / 1.758;
          // 引线：从端子球位置 → pin (相距5px)
          for (const pin of c.pins) {
            const isPos = pin.label === '+';
            const color = isPos ? '#e53935' : '#00bcd4';
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pin.dx, pin.dy);
            ctx.lineTo(pin.dx, pin.dy - 5);
            ctx.stroke();
          }
        }

        // === AC Source: draw lead wires from image bottom down to pin positions ===
        if (c.type === 'ac_source' && c.pins && c.pins.length >= 2) {
          const wireTopY = bh / 2 - 5;        // just below the image (plug cable end)
          const leadLen = 18;                  // length of visible lead wire
          const pinSpacing = 30;               // horizontal distance between L and N pin dots
          for (const pin of c.pins) {
            const isL = pin.label === 'L';
            const x = pin.dx;
            const color = isL ? '#e53935' : '#1e88e5'; // L=red, N=blue
            ctx.strokeStyle = color;
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, wireTopY);
            ctx.lineTo(x, pin.dy - 6);
            ctx.stroke();
          }
        }

        // Glow effects on top of image — screen blend for realistic light emission
        if (c.type === 'lamp' && S.simRunning && c.simCurrent > 0) {
          // lamp_on image already has baked-in warm glow;
          // keep a subtle pulsing halo for extra realism
          // 亮度随实际功率变化：brightness ∝ (I/Ir)^2
          const Ir = (c.props.wattage || 60) / (c.props.voltage || 220);
          const I_A = (c.simCurrent || 0) / 1000;
          const intensity = Math.min(Math.max(0, (I_A / Ir) * (I_A / Ir)), 1);
          const cx = 0, cy = -55;
          const r = 77;

          ctx.globalCompositeOperation = 'screen';

          const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
          grd.addColorStop(0, `rgba(255,255,220,${0.15 * intensity})`);
          grd.addColorStop(1, 'transparent');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalCompositeOperation = 'source-over';
        }

        if (c.type === 'led' && S.simRunning && c.simCurrent > 0) {
          const color = c.props.color || '#ff4444';
          const intensity = Math.min(c.simCurrent / 10, 1);
          const glowR = 18 + intensity * 12 + Math.sin(Date.now() / 300) * 3;
          const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
          grd.addColorStop(0, color);
          grd.addColorStop(0.5, color + '66');
          grd.addColorStop(1, 'transparent');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(0, 0, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        if ((c.type === 'motor_dc') && S.simRunning && c.simCurrent > 0) {
          const speed = Math.min(c.simCurrent / 5, 1);
          const angle = Date.now() / (200 - speed * 150);
          ctx.strokeStyle = 'rgba(240,136,62,0.6)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const a = angle + i * Math.PI * 2 / 3;
            ctx.beginPath();
            ctx.arc(0, -2, 14, a, a + 0.8);
            ctx.stroke();
          }
        }

        if (c.type === 'buzzer' && S.simRunning && c.simCurrent > 0) {
          ctx.translate(Math.sin(Date.now() / 50) * 1.5, Math.sin(Date.now() / 50) * 1.5);
          const ripplePhase = (Date.now() / 300) % 1;
          const rippleR = 15 + ripplePhase * 15;
          ctx.strokeStyle = `rgba(88,166,255,${0.4 * (1 - ripplePhase)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, rippleR, -0.5, 0.5);
          ctx.stroke();
          const ripplePhase2 = ((Date.now() / 300) + 0.5) % 1;
          const rippleR2 = 15 + ripplePhase2 * 15;
          ctx.strokeStyle = `rgba(88,166,255,${0.3 * (1 - ripplePhase2)})`;
          ctx.beginPath();
          ctx.arc(0, 0, rippleR2, -0.5, 0.5);
          ctx.stroke();
        }

        // === SPST: near-vertical wires + offset contacts + seesaw arm ===
        if (c.type === 'spst') {
          const closed = c.props.closed;
          const halfH = bh / 2;  // 80
          const pinR = 9;

          // Terminal positions: outside panel edge (half=80, 3px outside)
          const termTopY = -85;
          const termBotY =  85;

          // Contacts: arm ~66px, wire ~43px
          const redX  = 0,  redY  = -33;
          const greenX = 0,  greenY =  33;

          function drawPinDisc(x, y, r, fillColor, strokeColor, label) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            if (label) {
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = fillColor;
              ctx.fillText(label, x + r + 4, y);
            }
          }

          // Draw terminals
          drawPinDisc(0, termTopY, pinR, '#f85149', '#c02222', 'L');
          drawPinDisc(0, termBotY, pinR, '#22c55e', '#166534', 'L1');

          // Thick wires (almost vertical, only 3px horizontal offset)
          ctx.lineCap = 'round';
          ctx.lineWidth = 7;

          ctx.strokeStyle = '#e53e3e';
          ctx.beginPath();
          ctx.moveTo(0, termTopY + pinR);
          ctx.lineTo(redX, redY);
          ctx.stroke();

          ctx.strokeStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(0, termBotY - pinR);
          ctx.lineTo(greenX, greenY);
          ctx.stroke();

          // Contact dots
          ctx.fillStyle = '#c0392b';
          ctx.beginPath();
          ctx.arc(redX, redY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#27ae60';
          ctx.beginPath();
          ctx.arc(greenX, greenY, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Seesaw arm — pivots at RED contact dot
          const pivotX = redX, pivotY = redY;
          const armWidth = 6;

          // Arm length = distance from red dot to green dot
          const dx = greenX - redX;   // 0
          const dy = greenY - redY;   // 66
          const armLen = Math.sqrt(dx*dx + dy*dy);  // 66

          if (closed) {
            // ON: arm reaches green contact dot
            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = armWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(greenX, greenY);
            ctx.stroke();

            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(greenX, greenY, 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // OFF: same length, tilt 12° left-down from straight-down
            const angle = -18 * Math.PI / 180;
            const endX = pivotX + armLen * Math.sin(angle);   // -3 + 65.3*(-0.208) ≈ -16.6
            const endY = pivotY + armLen * Math.cos(angle);   // -35 + 65.3*0.978 ≈ +28.9

            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = armWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }
        }

        // === 自回弹开关: vertical wires + offset contacts + spring-loaded seesaw arm ===
        if (c.type === 'spst_momentary') {
          const closed = c.props.closed;
          const pinR = 9;

          // Terminal positions: outside panel edge (half=80, 5px outside for bigger pins)
          const termTopY = -85;
          const termBotY =  85;

          // Contacts: arm ~56px, wire ~27px (scaled for 160×160)
          const redX  = 0,  redY  = -28;
          const greenX = 0,  greenY =  28;

          function drawPinDisc(x, y, r, fillColor, strokeColor, label) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            if (label) {
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = fillColor;
              ctx.fillText(label, x + r + 4, y);
            }
          }

          // Draw terminals (red L at top, green L1 at bottom)
          drawPinDisc(0, termTopY, pinR, '#f85149', '#c02222', 'L');
          drawPinDisc(0, termBotY, pinR, '#22c55e', '#166534', 'L1');

          // Vertical wires from terminals to internal contact points
          ctx.lineCap = 'round';
          ctx.lineWidth = 7;

          ctx.strokeStyle = '#e53e3e';
          ctx.beginPath();
          ctx.moveTo(0, termTopY + pinR);
          ctx.lineTo(redX, redY);
          ctx.stroke();

          ctx.strokeStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(0, termBotY - pinR);
          ctx.lineTo(greenX, greenY);
          ctx.stroke();

          // Contact dots
          ctx.fillStyle = '#c0392b';
          ctx.beginPath();
          ctx.arc(redX, redY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#27ae60';
          ctx.beginPath();
          ctx.arc(greenX, greenY, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Spring-loaded seesaw arm — pivots at RED contact, reaches GREEN when pressed
          const pivotX = redX, pivotY = redY;
          const armWidth = 6;
          const dy = greenY - redY;   // 56
          const armLen = dy;          // contacts vertically aligned

          if (closed) {
            // PRESSED: arm connects red → green (circuit closes)
            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = armWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(greenX, greenY);
            ctx.stroke();

            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(greenX, greenY, 3, 0, Math.PI * 2);
            ctx.fill();

          } else {
            // RELEASED: arm springs away (tilts left, spring-back)
            const angle = -22 * Math.PI / 180;
            const endX = pivotX + armLen * Math.sin(angle);
            const endY = pivotY + armLen * Math.cos(angle);

            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = armWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }
        }

        // === bell_dc: auto-ring when powered (sound only, no overlay animation on photo) ===
        if (c.type === 'bell_dc') {
          const isRinging = S.simRunning && c.simCurrent > 0;
          if (isRinging && !c._ringing) {
            c._ringing = true;
            BellAudio.ring(c.id);
          } else if (!isRinging && c._ringing) {
            c._ringing = false;
            BellAudio.stop();
          }
        }

        ctx.restore();  // restore outer save (back to global coords)

        // Draw floating pins for other image-based components
        if (c.type !== 'spst' && c.type !== 'spst_momentary') {
          this._drawPinsForComponent(c);
        } else if (!isXray && WireRouter.isActive() && WireRouter.startPin) {
          // SPST routing pin highlights (drawn manually since spst bypasses _drawPinsForComponent)
          for (const pin of c.pins) {
            const px = c.x + pin.dx, py = c.y + pin.dy;
            const pinR = c.pinRadius || c.props.pinRadius || 9;
            const isStart = (WireRouter.startPin.comp === c.id && WireRouter.startPin.pin === pin.id);
            const wp = WireRouter.wireType || 'live';
            const hc = WireRouter.WireColors[wp] || '#e53935';
            const pulse = isStart
              ? (0.35 + Math.sin(Date.now() / 400) * 0.25)
              : (0.18 + Math.sin(Date.now() / 500) * 0.12);
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(px, py, pinR + 5, 0, Math.PI * 2);
            ctx.strokeStyle = hc;
            ctx.lineWidth = isStart ? 3 : 2.5;
            ctx.setLineDash(isStart ? [] : [3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
        // 遥控器带照片时，照片绘后再叠加可配置按键（rf_remote 有照片、bt_remote 可带可无）
        if (c.type === 'rf_remote' || c.type === 'bt_remote') {
          drawRemoteButtons(c, bw, bh);
        }
        return;
      }

      // === ICON-BASED COMPONENTS (original dark-box style) ===
      // Selection glow
      if (sel) { ctx.shadowColor = catColor; ctx.shadowBlur = 14; }

      const grad = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
      if (isXray) {
        grad.addColorStop(0, hexToRGBA(catColor, 0.06));
        grad.addColorStop(1, hexToRGBA(catColor, 0.12));
      } else {
        grad.addColorStop(0, '#1c2333');
        grad.addColorStop(1, '#252d3a');
      }
      ctx.fillStyle = grad;
      ctx.strokeStyle = sel ? catColor : (isXray ? hexToRGBA(catColor, 0.25) : '#30363d');
      ctx.lineWidth = sel ? 2 : 1;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      // Internal structure
      if (S.showInternal || isXray) this.drawInternal(c, isXray, catColor);

      // Icon
      ctx.fillStyle = isXray ? hexToRGBA(catColor, 0.9) : '#e6edf3';
      ctx.font = '18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.icon, 0, -4);

      // Name
      ctx.font = '9px system-ui';
      ctx.fillStyle = isXray ? hexToRGBA(catColor, 0.6) : '#8b949e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.name, 0, 14);

      // Value label
      let valStr = this.getValueLabel(c);
      if (valStr) {
        ctx.font = '8px monospace';
        ctx.fillStyle = isXray ? hexToRGBA(catColor, 0.4) : '#484f58';
        ctx.fillText(valStr, 0, 26);
      }

      ctx.restore();

      // Draw pins
      this._drawPinsForComponent(c);
    });
  },


  // ==================== Draw pin labels as the TOPMOST layer ====================
  // Labels NEVER adopt the wire color. Drawn LAST in render() so wires and the
  // current-flow animation can never cover them. Uses an outline halo so text
  // stays readable over any wire color (and over the white export background).
  drawPinLabels() {
    ctx.save();
    ctx.translate(S.pan.x, S.pan.y);
    ctx.scale(S.zoom, S.zoom);

    const onWhite = S.recBg === 'white';
    // Two palettes: dark canvas (normal) vs white export/recording background.
    // NO/COM/NC use gold to match the PCB's yellow terminals.
    const P = onWhite
      ? { live:'#d32f2f', l1:'#2e7d32', neutral:'#1565c0', neg:'#00838f', def:'#222222', dry:'#b8860b' }
      : { live:'#f85149', l1:'#22c55e', neutral:'#58a6ff', neg:'#00bcd4', def:'#c9d1d9', dry:'#c9d1d9' };
    const halo = onWhite ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.85)';

    S.components.forEach(c => {
      // SPST draws its own L/L1 labels inside the component — leave as-is
      if (c.type === 'spst' || c.type === 'spst_momentary') return;

      const baseFontSize = (c.type === 'battery_12v') ? 40
                     : (c.type === 'bell_dc') ? 28
                     : (c.type === 'lamp') ? 22
                     : (c.type === 'dry_relay' || c.type === 'bt_relay') ? 24
                     : 16;

      c.pins.forEach(pin => {
        if (!pin.label) return;
        const px = c.x + pin.dx, py = c.y + pin.dy;
        const lbl = pin.label.toUpperCase();
        // 每个引脚可单独设置字号（fs），未设置则按元件默认
        const fs = pin.fs || baseFontSize;
        const font = 'bold ' + fs + 'px Arial';

        // Stable color — never the wire color；优先使用后台设置的自定义标注色
        let color;
        if (pin.labelColor && /^#[0-9a-fA-F]{6}$/.test(pin.labelColor)) {
          color = pin.labelColor;
        } else if (lbl === 'L' || lbl === '+') color = P.live;
        else if (lbl === 'L1') color = P.l1;
        else if (lbl === 'N') color = P.neutral;
        else if (lbl === '-') color = P.neg;
        else if (lbl === 'NO' || lbl === 'COM' || lbl === 'NC') color = P.dry;
        else color = P.def;

        let lx = px, ly = py;
        if (pin.lp && (pin.lo !== undefined || pin.ld !== undefined)) {
          // 用户指定了文字方位（上/下/左/右/手动微调）→ 用 lo/ld
          lx = px + (pin.lo || 0);
          ly = py + (pin.ld || 0);
        } else {
          const adx = Math.abs(pin.dx), ady = Math.abs(pin.dy);
          if (adx > ady) {
            ly = py + (pin.dy >= 0 ? 20 : -20);
            if (ady > 0) ly = py + (pin.dy > 0 ? 20 : -20);
            else ly = py - 17;
          } else {
            lx = px + (pin.dx > 0 ? 23 : (pin.dx < 0 ? -23 : 0));
            ly = py + (ady > 0 ? (pin.dy > 0 ? 20 : -20) : 0);
          }
        }

        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, fs * 0.18);
        ctx.strokeStyle = halo;
        ctx.strokeText(pin.label, lx, ly);
        ctx.fillStyle = color;
        ctx.fillText(pin.label, lx, ly);
      });
    });

    ctx.restore();
  },


  _drawPinsForComponent(c) {
    const isXray = false;
    c.pins.forEach(pin => {
      const px = c.x + pin.dx, py = c.y + pin.dy;
      const connected = WireRouter.isPinConnected(c.id, pin.id);
      const pinWireType = connected ? WireRouter.getPinWireType(c.id, pin.id) : null;
      const wireColor = pinWireType ? WireRouter.WireColors[pinWireType] : null;
      const defaultPinR = (c.type === 'lamp' || c.type === 'spst' || c.type === 'spst_momentary') ? 9 : (c.type === 'battery_12v' ? 10 : 8.5);
      const pinR = c.pinRadius || c.props.pinRadius || defaultPinR;

      if (connected && wireColor && !isXray) {
        // 接线后：先画一层线型彩色圆盘（避免被浅银色压接头盖住看不清），
        // 中心再压一个较小的金属接头，露出彩色外圈以标识线型
        ctx.beginPath();
        ctx.arc(px, py, pinR, 0, Math.PI * 2);
        ctx.fillStyle = wireColor;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.stroke();
        drawCrimp3D(px, py, wireColor, pinR * 0.58);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, pinR, 0, Math.PI * 2);
        if (isXray) {
          ctx.fillStyle = connected ? '#39d2c0' : 'rgba(57,210,192,0.4)';
        } else {
          // 自定义端子颜色优先（后台端子色选择器设置），否则按标签启发式
          const customTerm = (pin.color && /^#[0-9a-fA-F]{6}$/.test(pin.color)) ? pin.color : null;
          if (customTerm) {
            ctx.fillStyle = customTerm;
            ctx.strokeStyle = shadeHex(customTerm, 0.4);
          } else {
            const lbl = pin.label ? pin.label.toUpperCase() : '';
            const isL = lbl === 'L';
            const isL1 = lbl === 'L1';
            const isN = lbl === 'N' || lbl === 'L2';
            if (isL || isL1 || isN) {
              // L=red (live), L1=green (output), N/L2=blue (neutral)
              if (isL) {
                ctx.fillStyle = '#f85149'; ctx.strokeStyle = '#c02222';
              } else if (isL1) {
                ctx.fillStyle = '#22c55e'; ctx.strokeStyle = '#166534';
              } else {
                ctx.fillStyle = '#58a6ff'; ctx.strokeStyle = '#2266cc';
              }
            } else if (lbl === 'NO' || lbl === 'COM' || lbl === 'NC') {
              // 干接点输出端子 → 黄色，匹配PCB黄圈
              ctx.fillStyle = '#f0c040'; ctx.strokeStyle = '#c09020';
            } else {
              const grd = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, pinR);
              grd.addColorStop(0, '#484f58');
              grd.addColorStop(1, '#2d333b');
              ctx.fillStyle = grd;
              ctx.strokeStyle = '#6e7681';
            }
          }
        }
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // === Highlight valid target pins during routing ===
      if (!isXray && WireRouter.isActive() && WireRouter.startPin) {
        const isStart = (WireRouter.startPin.comp === c.id && WireRouter.startPin.pin === pin.id);
        if (isStart) {
          // Bright pulsing ring on start pin
          const pulse = 0.35 + Math.sin(Date.now() / 400) * 0.25;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(px, py, pinR + 6, 0, Math.PI * 2);
          const wp = WireRouter.wireType || 'live';
          ctx.strokeStyle = WireRouter.WireColors[wp] || '#e53935';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        } else {
          const wp = WireRouter.wireType || 'live';
          const hc = WireRouter.WireColors[wp] || '#e53935';
          const pulse = 0.18 + Math.sin(Date.now() / 500) * 0.12;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(px, py, pinR + 5, 0, Math.PI * 2);
          ctx.strokeStyle = hc;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    });

    // 故障指示已通过故障面板文字显示，不在元件上画红色虚线框
  },
  getValueLabel(c) {
    if (c.type === 'resistor') return formatR(c.props.resistance);
    if (c.type === 'capacitor') return c.props.capacitance + 'μF';
    if (c.type === 'inductor') return c.props.inductance + 'mH';
    if (c.type === 'battery' || c.type === 'ac_source' || c.type === 'battery_12v') return c.props.voltage + 'V';
    if (c.type === 'dc_dc') return c.props.inputV + '→' + c.props.outputV + 'V';
    if (c.type === 'led') return c.props.forwardV + 'V';
    if (c.type === 'switch' || c.type === 'breaker') return c.props.closed ? 'ON' : 'OFF';
    if (c.type === 'spdt') return '→' + c.props.position;
    if (c.type === 'rotary') return '→' + c.props.position;
    if (c.type === 'push_no' || c.type === 'push_nc') return c.props.pressed ? '按下' : '释放';
    if (c.type === 'fuse') return c.props.blown ? '熔断!' : c.props.rating + 'A';
    if (c.type === 'relay5' || c.type === 'relay8' || c.type === 'contactor' || c.type === 'dry_relay' || c.type === 'bt_relay') return c.props.energized ? '吸合' : '释放';
    if (c.type === 'motor_dc') return c.props.voltage + 'V';
    if (c.type === 'buzzer') return c.props.voltage + 'V';
    if (c.type === 'solenoid') return c.props.voltage + 'V';
    if (c.type === 'bell_dc') return S.simRunning && c.simCurrent > 0 ? '叮~叮~' : c.props.voltage + 'V';
    if (c.type === 'lamp') return c.props.wattage + 'W';
    if (c.type === 'dry_signal') return c.props.status || (c.props.energized ? '已开机' : '等待脉冲');
    if (c.type === 'diode') return c.props.forwardV + 'V';
    if (c.type === 'npn') return 'β=' + c.props.beta;
    if (c.props.behavior === 'relay') return c.props.energized ? 'ON' : 'OFF';
    return '';
  },

  drawInternal(c, isXray, style) {
    ctx.globalAlpha = isXray ? 0.6 : 0.3;
    ctx.strokeStyle = style; ctx.lineWidth = 0.8; ctx.fillStyle = style;

    if (c.type === 'resistor') {
      ctx.beginPath();
      ctx.moveTo(-22, -3); ctx.lineTo(-18, -7); ctx.lineTo(-10, 7); ctx.lineTo(-2, -7);
      ctx.lineTo(6, 7); ctx.lineTo(14, -7); ctx.lineTo(18, 3);
      ctx.stroke();
    } else if (c.type === 'capacitor') {
      ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-6, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(6, 10); ctx.stroke();
    } else if (c.type === 'inductor') {
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-12 + i * 8, 0, 4, Math.PI, 0); ctx.stroke(); }
    } else if (c.type === 'led') {
      const isOn = S.simRunning && c.simCurrent > 0;
      const ledColor = isOn ? (c.props.color || '#ff4444') : style;
      if (isOn) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = ledColor; ctx.fillStyle = ledColor;
      }
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(5, 0); ctx.lineTo(-4, 5); ctx.closePath();
      if (isOn) ctx.fill(); else ctx.stroke();
    } else if (c.type === 'battery' || c.type === 'ac_source') {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-10, 8); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-4, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(4, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(10, 5); ctx.stroke();
      ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText('+', 12, -4); ctx.fillText('-', -14, -4);
    } else if (c.type === 'switch' || c.type === 'spst') {
      // =========================================================
      // 真实跷跷板开关 (Seesaw/Rocker Switch)
      // 特点: ON/OFF状态直观、端子颜色编码(L1红=相线入/L2蓝=相线出)
      // =========================================================
      const closed = c.props.closed;
      const plateW = 70, plateH = 54;        // 开关面板尺寸
      const plateX = -35, plateY = -27;      // 面板左上角位置
      const rockerW = 54, rockerH = 44;      // 跷跷板摇键尺寸
      const tiltAngle = closed ? -0.28 : 0.28; // 倾斜角度 (rad)

      // --- 画线连接端子与开关面板 ---
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      // L1 (左, 红) → 面板左侧
      ctx.beginPath();
      ctx.moveTo(-58, 0);
      ctx.lineTo(-plateX - 4, 0);
      ctx.stroke();
      // 面板右侧 → L2 (右, 蓝)
      ctx.beginPath();
      ctx.moveTo(plateX + plateW + 4, 0);
      ctx.lineTo(58, 0);
      ctx.stroke();

      // --- 开关面板底座 (3D效果) ---
      ctx.save();
      ctx.translate(0, 0);

      // 底座阴影
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.roundRect(plateX + 2, plateY + 3, plateW, plateH, 6);
      ctx.fill();

      // 面板主体 (深灰金属质感)
      const plateGrad = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
      plateGrad.addColorStop(0, '#4a4a4a');
      plateGrad.addColorStop(0.3, '#3a3a3a');
      plateGrad.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = plateGrad;
      ctx.beginPath();
      ctx.roundRect(plateX, plateY, plateW, plateH, 6);
      ctx.fill();

      // 面板边框
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.stroke();

      // --- 跷跷板摇键 ( rocker ) ---
      ctx.save();
      ctx.translate(plateW / 2 + plateX, plateH / 2 + plateY);
      ctx.rotate(tiltAngle);

      // 摇键阴影
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.roundRect(-rockerW / 2 + 1, -rockerH / 2 + 2, rockerW, rockerH, 5);
      ctx.fill();

      // 摇键主体 (浅灰塑料)
      const rockerGrad = ctx.createLinearGradient(-rockerW / 2, -rockerH / 2, rockerW / 2, rockerH / 2);
      if (closed) {
        // ON: 偏暖白色
        rockerGrad.addColorStop(0, '#e8e8e8');
        rockerGrad.addColorStop(1, '#c8c8c8');
      } else {
        // OFF: 偏冷灰色
        rockerGrad.addColorStop(0, '#b0b0b0');
        rockerGrad.addColorStop(1, '#909090');
      }
      ctx.fillStyle = rockerGrad;
      ctx.beginPath();
      ctx.roundRect(-rockerW / 2, -rockerH / 2, rockerW, rockerH, 5);
      ctx.fill();

      // 摇键边框
      ctx.strokeStyle = closed ? '#888' : '#666';
      ctx.lineWidth = 1;
      ctx.stroke();

      // --- ON/OFF 标签 ---
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // ON 文字 (上侧)
      ctx.fillStyle = closed ? '#1a8a1a' : '#aaa';
      ctx.fillText('ON', 0, -rockerH / 2 + 12);
      // OFF 文字 (下侧)
      ctx.fillStyle = closed ? '#aaa' : '#8a2a2a';
      ctx.fillText('OFF', 0, rockerH / 2 - 12);

      // 中线 (指示当前状态)
      ctx.strokeStyle = closed ? 'rgba(40,160,40,0.6)' : 'rgba(160,40,40,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(-rockerW / 2 + 4, 0);
      ctx.lineTo(rockerW / 2 - 4, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      // --- 状态指示灯 LED (右上角) ---
      const ledX = plateX + plateW - 10, ledY = plateY + 10;
      const ledOn = closed;
      if (ledOn) {
        // LED发光效果
        ctx.shadowColor = '#00ff44';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(ledX, ledY, 4, 0, Math.PI * 2);
      ctx.fillStyle = ledOn ? '#00ff44' : '#333';
      ctx.fill();
      if (ledOn) {
        ctx.beginPath();
        ctx.arc(ledX, ledY, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#aaffaa';
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      ctx.restore();

      // --- 端子圆点 + 颜色编码 ---
      // L1 (左, 红色 = 相线/火线)
      ctx.beginPath();
      ctx.arc(-58, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#cc2222'; // 红色端子
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // L1 标签
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#cc2222';
      ctx.textAlign = 'center';
      ctx.fillText('L1', -58, 11);

      // L2 (右, 蓝色 = 零线)
      ctx.beginPath();
      ctx.arc(58, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2255cc'; // 蓝色端子
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // L2 标签
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#2255cc';
      ctx.textAlign = 'center';
      ctx.fillText('L2', 58, 11);
    } else if (c.type === 'spdt' || c.type === 'rotary') {
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(0, 0);
      const tgt = c.props.position === 1 ? -15 : 15;
      ctx.lineTo(14, tgt); ctx.stroke();
      ctx.beginPath(); ctx.arc(14, -15, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, 15, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (c.type === 'relay5' || c.type === 'relay8' || c.type === 'contactor' || c.type === 'dry_relay' || c.type === 'bt_relay') {
      // 蓝牙模块用蓝色描边以区分 433 模块
      if (c.type === 'bt_relay') ctx.strokeStyle = '#30363d';
      // Coil
      ctx.beginPath(); ctx.arc(-20, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('C', -20, 3);
      // Contacts
      const comY = c.type === 'relay5' ? -10 : -15;
      ctx.beginPath(); ctx.moveTo(15, comY); ctx.lineTo(15, comY);
      if (c.props.energized) { ctx.lineTo(25, comY - 8); }
      else { ctx.lineTo(25, comY + 8); }
      ctx.stroke();
      if (c.type === 'bt_relay') {
        ctx.fillStyle = '#2196f3';
        ctx.font = 'bold 11px "PingFang SC",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('蓝牙', 0, -bh / 2 + 14);
        ctx.textBaseline = 'alphabetic';
      }
    } else if (c.type === 'motor_dc') {
      ctx.beginPath(); ctx.arc(0, -2, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', 0, -2);
    } else if (c.type === 'diode') {
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(5, 0); ctx.lineTo(-3, 5); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(5, 5); ctx.stroke();
    } else if (c.type === 'lamp') {
      const isOn = S.simRunning && c.simCurrent > 0;
      if (isOn) {
        // Glowing bulb glass area
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffcc00';
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(0, -37, 14, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, -37, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(8, 6); ctx.stroke();
      }
    } else if (c.type === 'fuse') {
      ctx.beginPath(); ctx.moveTo(-15, -3); ctx.lineTo(15, -3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-15, 3); ctx.lineTo(15, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(-5, 6); ctx.stroke();
    } else if (c.type === 'npn') {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-10, -12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-10, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-12, 15); ctx.stroke();
    } else if (c.type === 'bell_dc') {
      // 无实物图时绘制完整电铃（兜底）
      const isRinging = S.simRunning && c.simCurrent > 0;
      const hammerX = 10, hammerY = -18;
      ctx.beginPath();
      ctx.arc(0, -5, 28, Math.PI, 0, false);
      ctx.lineTo(28, 8); ctx.lineTo(-28, 8);
      ctx.closePath();
      ctx.fillStyle = '#c9a800'; ctx.fill();
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-28, 8); ctx.lineTo(28, 8);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -18); ctx.lineTo(hammerX, hammerY);
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(hammerX, hammerY, 4, 0, Math.PI*2);
      ctx.fillStyle = '#888'; ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
      // 触发音效（兜底路径）
      if (isRinging && !c._ringing) {
        c._ringing = true;
        BellAudio.ring(c.id);
      } else if (!isRinging && c._ringing) {
        c._ringing = false;
        BellAudio.stop();
      }
    } else if (c.type === 'rf_remote' || c.type === 'bt_remote') {
      // 无线遥控器：基于实物照片(rf_remote) 或 画布矢量样式(bt_remote) + 可配置按键（c.buttons）
      const isBt = c.type === 'bt_remote';
      const sigColor = isBt ? '#2196f3' : '#ffa800';

      // 蓝牙遥控器无实物照片，先画一个蓝色机身作为背景
      if (isBt) {
        const pad = 4, r = 16;
        const x0 = -bw / 2 + pad, y0 = -bh / 2 + pad, w0 = bw - pad * 2, h0 = bh - pad * 2;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r);
        ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r);
        ctx.arcTo(x0, y0 + h0, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + w0, y0, r);
        ctx.closePath();
        ctx.fillStyle = '#1b2330';
        ctx.fill();
        ctx.strokeStyle = '#3a4250';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = sigColor;
        ctx.font = 'bold 13px "PingFang SC",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('📶 蓝牙', 0, -bh / 2 + 10);
        ctx.textBaseline = 'alphabetic';
      }

      // 信号图标 + 按键 + 底部信号文字，统一由共享函数绘制（带照片/无照片通用）
      drawRemoteButtons(c, bw, bh);
    } else if (c.type === 'rf_remote_2key') {
      // 433MHz 两键遥控器：实物图 366×500 (w=200, h=273)
      // PIL边缘检测精确坐标: ON img(110,102) 30.1%/20.5%, OFF img(130,226) 35.5%/45.1%
      const ledY_pct = 0.080;   // LED指示灯位置比例（顶部）
      const ledCY = (ledY_pct - 0.5) * c.h;  // LED Y 相对组件中心

      const isPressed1 = S.simRunning && c.props.pressed1;
      const isPressed2 = S.simRunning && c.props.pressed2;
      const anyPressed = isPressed1 || isPressed2;

      // 433 遥控按下时的「信号图标/LED/波纹」装饰已全部去除——按下仅由 imageOn 切换表现通断。

      // === 底部标识文字 ===
      ctx.fillStyle = '#999';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ON / OFF', 0, c.h / 2 - 1);
      // 干接点控制器：模式文字（顶部大号）+ 模式按钮（底部矩形）
      const mode = c.props.mode || 'none';
      const modeText = mode === 'momentary' ? '点动' : mode === 'toggle' ? '自锁' : mode === 'interlock' ? '互锁' : '纯线圈';
      const nextMode = mode === 'none' ? '点动' : mode === 'momentary' ? '自锁' : mode === 'toggle' ? '互锁' : '纯线圈';
      const isPowered = true; // always allow mode switching (RF modes don't need coil current)
      // 顶部大号模式文字
      const modeColor = mode === 'none' ? '#ff5252' : '#4caf50';
      ctx.fillStyle = modeColor;
      ctx.font = 'bold 24px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('模式: ' + modeText, 0, -bh / 2 + 2);
      // 底部矩形模式切换按钮
      const btnW = 90, btnH = 28;
      const btnX = 0, btnY = bh / 2 - btnH - 6;
      const rx = 6; // 圆角
      // 按钮背景
      ctx.beginPath();
      ctx.moveTo(btnX - btnW/2 + rx, btnY);
      ctx.lineTo(btnX + btnW/2 - rx, btnY);
      ctx.arcTo(btnX + btnW/2, btnY, btnX + btnW/2, btnY + rx, rx);
      ctx.lineTo(btnX + btnW/2, btnY + btnH - rx);
      ctx.arcTo(btnX + btnW/2, btnY + btnH, btnX + btnW/2 - rx, btnY + btnH, rx);
      ctx.lineTo(btnX - btnW/2 + rx, btnY + btnH);
      ctx.arcTo(btnX - btnW/2, btnY + btnH, btnX - btnW/2, btnY + btnH - rx, rx);
      ctx.lineTo(btnX - btnW/2, btnY + rx);
      ctx.arcTo(btnX - btnW/2, btnY, btnX - btnW/2 + rx, btnY, rx);
      ctx.closePath();
      ctx.fillStyle = isPowered ? '#ffa800' : '#555';
      ctx.fill();
      ctx.strokeStyle = isPowered ? '#ffd000' : '#444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 按钮文字: 点击切换为 XXX
      ctx.fillStyle = isPowered ? '#1a1a1a' : '#aaa';
      ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('切换:' + nextMode, btnX, btnY + btnH / 2);
      // 保存按钮包围盒供点击检测
      c._modeBtnX = btnX;
      c._modeBtnY = btnY;
      c._modeBtnR = Math.max(btnW / 2, btnH / 2); // 检测半径用对角线一半
      c._modeBtnW = btnW;
      c._modeBtnH = btnH;
    }
    ctx.globalAlpha = 1;
  },

  addComponent(def, x, y) {
    if (S.components.length >= Config.maxComponents) { UI.toast('元件数量已达上限', 'warning'); return; }
    const comp = Registry.createInstance(def, x, y);
    S.components.push(comp);
    S.selected = comp.id;
    S.dirty = true;
    History.push({ type: 'add', comp: { ...comp } });
    UI.showProps(comp);
    UI.toast('已添加: ' + comp.name, 'success');
    markStaticDirty();
  },

  addComponentSilent(def, x, y) {
    const comp = Registry.createInstance(def, x, y);
    S.components.push(comp);
    return comp;
  },

  updateCounts() {
    document.getElementById('compCount').textContent = S.components.length;
    document.getElementById('wireCount').textContent = S.wires.length;
  }
};

// 无线遥控器（rf_remote / bt_remote）按键与信号叠加层。
// 既用于「带照片」的遥控器（在 if(c.image) 块内照片绘后调用），
// 也用于「无照片」的蓝牙遥控器（在图标分支内机身绘后调用）。
function drawRemoteButtons(c, bw, bh) {
  const isBt = c.type === 'bt_remote';
  const btns = (c.buttons && c.buttons.length) ? c.buttons : null;

  // 仅绘制「按下时的按键亮起反馈」（用户要的效果：按一下遥控器亮起，4秒后熄灭）。
  // 不画信号发射图标、不画外扩辉光方框——只把被按下的按键本身描成高亮实心，跟随 shape。
  if (!btns) return;
  btns.forEach((b, i) => {
    const isP = S.simRunning && c.props.pressedButtons && c.props.pressedButtons[i];
    if (!isP) return;
    const shape = b.shape || 'circle';
    const bx = b.x, by = b.y;
    const r = (b.w || b.h || 50) / 2;
    const hw = (b.w || 50) / 2, hh = (b.h || 50) / 2;
    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
    } else {
      const pad = 4, rr = 8;
      ctx.beginPath();
      ctx.moveTo(bx - hw + rr, by - hh);
      ctx.arcTo(bx + hw, by - hh, bx + hw, by + hh, rr);
      ctx.arcTo(bx + hw, by + hh, bx - hw, by + hh, rr);
      ctx.arcTo(bx - hw, by + hh, bx - hw, by - hh, rr);
      ctx.arcTo(bx - hw, by - hh, bx + hw, by - hh, rr);
      ctx.closePath();
    }
    ctx.fillStyle = isBt ? 'rgba(33, 150, 243, 0.85)' : 'rgba(255, 140, 30, 0.85)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = isBt ? '#90caf9' : '#ffd0a0';
    ctx.stroke();
    ctx.restore();
  });
}


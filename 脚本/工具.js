// ==================== Section 14: Helpers ====================
function getComp(id) { return S.components.find(c => c.id === id); }
function getPinPos(comp, pinId) {
  const p = comp.pins.find(pp => pp.id === pinId);
  return p ? { x: comp.x + p.dx, y: comp.y + p.dy } : null;
}
function findPinAt(cx, cy) {
  for (const c of S.components) {
    for (const pin of c.pins) {
      const px = c.x + pin.dx, py = c.y + pin.dy;
      if (Math.hypot(cx - px, cy - py) < Config.pinHitRadius) return { comp: c.id, pin: pin.id };
    }
  }
  return null;
}
function findCompAt(cx, cy) {
  for (let i = S.components.length - 1; i >= 0; i--) {
    const c = S.components[i];
    if (Math.abs(cx - c.x) < (c.w || 100) / 2 && Math.abs(cy - c.y) < (c.h || 56) / 2) return c;
  }
  return null;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function formatR(r) { return r >= 1e6 ? (r / 1e6) + 'MΩ' : r >= 1e3 ? (r / 1e3) + 'kΩ' : r + 'Ω'; }
function getPointOnPath(points, dist) {
  let remaining = dist;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x, dy = points[i + 1].y - points[i].y;
    const segLen = Math.hypot(dx, dy);
    if (remaining <= segLen) {
      const t = remaining / Math.max(segLen, 0.01);
      return { x: points[i].x + dx * t, y: points[i].y + dy * t };
    }
    remaining -= segLen;
  }
  return points[points.length - 1];
}
function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Draw a realistic insulated wire along an orthogonal polyline path.
// Style: thin cylindrical cable with drop shadow + rim highlight.
// For ground wires, draws yellow/green striped insulation.
function drawPipe3D(points, color, width, alpha, wireType) {
  if (points.length < 2) return;
  const a = alpha == null ? 1 : alpha;
  const w = width || 4;
  const isGround = wireType === 'ground';

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1) Drop shadow (slightly offset, darker) — gives the wire lift off the board
  ctx.save();
  ctx.globalAlpha = a * 0.35;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = w + 1.6;
  ctx.beginPath();
  ctx.moveTo(points[0].x + 0.8, points[0].y + 0.8);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + 0.8, points[i].y + 0.8);
  ctx.stroke();
  ctx.restore();

  // 2) Main insulation body
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineWidth = w;
  if (isGround) {
    // Green base for ground, then yellow stripes on top
    ctx.strokeStyle = '#43a047';
  } else {
    ctx.strokeStyle = color;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();

  // 3) Ground: yellow diagonal stripes over green base
  if (isGround) {
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.strokeStyle = '#fdd835';
    ctx.lineWidth = w * 0.55;
    const segLen = 9, gapLen = 9;
    ctx.setLineDash([segLen, gapLen]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 4) Cylindrical rim highlight (top-left sheen) — makes it look round
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.8, w * 0.22);
  ctx.beginPath();
  ctx.moveTo(points[0].x - 0.6, points[0].y - 0.6);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x - 0.6, points[i].y - 0.6);
  ctx.stroke();
  ctx.restore();

  // 5) Bottom-right darker edge for roundness
  ctx.save();
  ctx.globalAlpha = a * 0.35;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(0.8, w * 0.22);
  ctx.beginPath();
  ctx.moveTo(points[0].x + 0.6, points[0].y + 0.6);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + 0.6, points[i].y + 0.6);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 1;
}

// Crimp gradient cache: avoids createRadialGradient per frame
const _crimpGradCache = new Map();
function _getCrimpGradient(x, y, color, radius) {
  // Cache key: color+radius (position changes so we can't cache the gradient object directly,
  // but we can cache the color stops as a pattern)
  const key = color + '_' + radius;
  if (_crimpGradCache.has(key)) return _crimpGradCache.get(key);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const stops = {
    light: `rgba(${Math.min(255,r+70)},${Math.min(255,g+70)},${Math.min(255,b+70)},1)`,
    main: color,
    dark: `rgba(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)},1)`,
    shadow: `rgba(${Math.max(0,r-60)},${Math.max(0,g-60)},${Math.max(0,b-60)},0.5)`,
    r, g, b
  };
  _crimpGradCache.set(key, stops);
  return stops;
}

// Draw a small metallic crimp terminal where the wire meets the pin.
// Looks like a real wire ferrule / spade connector, not a colored candy bead.
function drawCrimp3D(x, y, color, radius) {
  const cr = (radius || 4.5) * 0.85; // slightly smaller than the pin

  // Dark pocket shadow
  ctx.beginPath();
  ctx.arc(x, y, cr + 0.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // Metal sleeve body (brushed silver / tin-plated copper look)
  const grad = ctx.createRadialGradient(x - cr*0.25, y - cr*0.25, cr*0.1, x, y, cr);
  grad.addColorStop(0, '#e8e8e8');
  grad.addColorStop(0.55, '#9e9e9e');
  grad.addColorStop(1, '#555555');
  ctx.beginPath();
  ctx.arc(x, y, cr, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Thin wire-color ring where insulation enters the crimp (subtle hint)
  ctx.beginPath();
  ctx.arc(x, y, cr * 0.7, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, cr * 0.22);
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Tiny highlight
  ctx.beginPath();
  ctx.arc(x - cr*0.25, y - cr*0.25, cr * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // Outer rim
  ctx.beginPath();
  ctx.arc(x, y, cr, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function getCircuitBounds() {
  if (S.components.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  S.components.forEach(c => {
    minX = Math.min(minX, c.x - (c.w || 100) / 2 - 20);
    minY = Math.min(minY, c.y - (c.h || 56) / 2 - 20);
    maxX = Math.max(maxX, c.x + (c.w || 100) / 2 + 20);
    maxY = Math.max(maxY, c.y + (c.h || 56) / 2 + 20);
  });
  return { minX, minY, maxX, maxY };
}
function zoomToFit() {
  const bounds = getCircuitBounds();
  if (!bounds) return;
  const padding = 60;
  const scaleX = (W - padding * 2) / (bounds.maxX - bounds.minX);
  const scaleY = (H - padding * 2) / (bounds.maxY - bounds.minY);
  S.zoom = Math.min(scaleX, scaleY, 2);
  S.pan.x = W / 2 - (bounds.minX + bounds.maxX) / 2 * S.zoom;
  S.pan.y = H / 2 - (bounds.minY + bounds.maxY) / 2 * S.zoom;
  document.getElementById('zoomLevel').textContent = Math.round(S.zoom * 100);
  markStaticDirty();
}

// Union-Find data structure
class UnionFind {
  constructor() { this.parent = new Map(); this.rank = new Map(); }
  make(x) { if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); } }
  has(x) { return this.parent.has(x); }
  find(x) {
    if (!this.parent.has(x)) return x;
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)));
    return this.parent.get(x);
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank.get(ra) < this.rank.get(rb)) this.parent.set(ra, rb);
    else if (this.rank.get(ra) > this.rank.get(rb)) this.parent.set(rb, ra);
    else { this.parent.set(rb, ra); this.rank.set(ra, this.rank.get(ra) + 1); }
  }
  connected(a, b) { return this.find(a) === this.find(b); }
}


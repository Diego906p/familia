// ===== Pizarra colaborativa =====
// Estado completo sincronizado en Firebase: quien entra ve todo lo ya dibujado.
// Sin persistencia histórica: el contenido solo se borra con "Limpiar todo".

requireAuth(["child", "admin", "guest"]);
const SESSION = getSession() || { role: "child", username: "luanna" };
const IS_ADMIN = SESSION.role === "admin";
const IS_GUEST = SESSION.role === "guest";
const GUEST_COLORS = ["#2eb872", "#ff7a3d", "#00b8c4", "#b35cff", "#e0a000", "#e0567a", "#3d8bff", "#7a9c2e", "#c4456e", "#5c8aff"];
function guestColor(id) { let h = 0; for (const c of (id || "")) h = (h * 31 + c.charCodeAt(0)) % GUEST_COLORS.length; return GUEST_COLORS[h]; }
const MY_NAME = IS_ADMIN ? "Papá" : (IS_GUEST ? SESSION.name : (SESSION.username === "luanna" ? "Luanna" : SESSION.username));
const MY_COLOR = IS_ADMIN ? "#4d9fff" : (IS_GUEST ? guestColor(SESSION.guestId) : "#ff4f9a");
const MY_KEY = IS_GUEST ? ("guest-" + (SESSION.guestId || Math.random().toString(36).slice(2, 7))) : (SESSION.role + "-" + (SESSION.username || "x"));
const MAX_GUESTS = 10;

document.getElementById("pzBack").addEventListener("click", () => {
  window.location.href = IS_ADMIN ? "admin.html" : "dashboard.html";
});

// ---------- Lienzo ----------
const canvas = document.getElementById("pzCanvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("pzStage");
const textInput = document.getElementById("pzTextInput");

const WORLD = { w: 4000, h: 3000 };   // área de trabajo (grande pero finita)
const CLIENT_ID = Math.random().toString(36).slice(2, 9);

let elements = [];           // copia local
const imgCache = {};         // id -> Image (para tipo imagen)
let zCounter = 0;

let tool = "select";
let color = "#3c3160";        // color de borde / trazo
let fillColor = "#ffd23d";    // color de relleno de figuras
let fillOn = false;           // ¿las figuras nuevas llevan relleno?
let borderStyle = "solid";    // solid | dashed | dotted
let brushFidelity = "balanced"; // precise | balanced | smooth
let recentColors = [];
let lineWidth = 4;
let lockRatio = false;
let bgType = "white";
let PERMS = { calculator: true, eraser: true, text: true, image: true, stickers: true, clear: true };

let scale = 1, tx = 20, ty = 20;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let drawing = null;
let selectedIds = new Set();
let dragMode = null;         // "move" | "resize" | "marquee" | "pan"
let dragStart = null;
let marquee = null;
let pendingSticker = null;

// ============================================================
//  RENDER
// ============================================================
function resizeCanvas() {
  const r = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  clampView();
  render();
}
window.addEventListener("resize", resizeCanvas);

function screenPos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
function pos(e) { const s = screenPos(e); return { x: (s.x - tx) / scale, y: (s.y - ty) / scale }; }

function clampView() {
  const vw = canvas.clientWidth || stage.clientWidth;
  const vh = canvas.clientHeight || stage.clientHeight;
  const M = 120;
  const wW = WORLD.w * scale, wH = WORLD.h * scale;
  if (wW <= vw) tx = (vw - wW) / 2; else tx = clamp(tx, vw - wW - M, M);
  if (wH <= vh) ty = (vh - wH) / 2; else ty = clamp(ty, vh - wH - M, M);
}

function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#d9d2ef";   // fuera del área de trabajo
  ctx.fillRect(0, 0, w, h);

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
  drawBackground();
  const ordered = [...elements].sort((a, b) => (layerRank(a.layer) - layerRank(b.layer)) || ((a.z || 0) - (b.z || 0)));
  for (const el of ordered) drawElement(el);
  if (drawing) drawElement(drawing);
  drawSelection();
  drawMarquee();
  drawCursors();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackground() {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, WORLD.w, WORLD.h); ctx.clip();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  if (bgType === "grid" || bgType === "lines") {
    ctx.strokeStyle = "#e3ddf3"; ctx.lineWidth = 1;
    for (let y = 0; y <= WORLD.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    if (bgType === "grid") for (let x = 0; x <= WORLD.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
  }
  ctx.strokeStyle = "#c9bff0"; ctx.lineWidth = 2; ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}

function drawElement(el) {
  if (el._hidden) return;
  ctx.save();
  ctx.strokeStyle = el.color === "none" ? "transparent" : (el.color || color);
  ctx.fillStyle = el.color === "none" ? "#3c3160" : (el.color || color);
  ctx.lineWidth = el.width || 2;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const op = el.opacity != null ? el.opacity : 1;
  ctx.globalAlpha = op;
  // Estilo de borde
  const lw = el.width || 2;
  if (el.borderStyle === "dashed") ctx.setLineDash([lw * 3, lw * 2.2]);
  else if (el.borderStyle === "dotted") ctx.setLineDash([0.1, lw * 2.2]);
  else ctx.setLineDash([]);

  if (el.type === "path" || el.type === "highlighter") {
    if (el.type === "highlighter") { ctx.globalAlpha = 0.35 * op; ctx.lineWidth = (el.width || 2) * 3; }
    ctx.beginPath();
    el.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    if (el.fill) { ctx.closePath(); ctx.globalAlpha = op; ctx.fillStyle = el.fill; ctx.fill(); ctx.globalAlpha = (el.type === "highlighter" ? 0.35 : 1) * op; ctx.beginPath(); el.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); }
    ctx.stroke();
  } else if (el.type === "line") {
    ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke();
  } else if (el.type === "arrow") {
    drawArrow(el.x1, el.y1, el.x2, el.y2, el.width || 2);
  } else if (el.type === "rect") {
    if (el.fill) { ctx.fillStyle = el.fill; ctx.fillRect(el.x, el.y, el.w, el.h); }
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  } else if (el.type === "triangle" || el.type === "star" || el.type === "polygon") {
    const poly = polyForShape(el);
    ctx.beginPath(); poly.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
    if (el.fill) { ctx.fillStyle = el.fill; ctx.fill(); }
    ctx.stroke();
  } else if (el.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    if (el.fill) { ctx.fillStyle = el.fill; ctx.fill(); }
    ctx.stroke();
  } else if (el.type === "text") {
    ctx.font = textFont(el); ctx.textBaseline = "top";
    const sz = el.size || 22, lh = sz * 1.25;
    const lines = textLines(el);
    const align = el.align || "left";
    ctx.textAlign = align;
    const ax = align === "center" ? el.x + (el.w || 0) / 2 : (align === "right" ? el.x + (el.w || 0) : el.x);
    lines.forEach((ln, i) => ctx.fillText(ln, ax, el.y + i * lh));
    ctx.textAlign = "left";
  } else if (el.type === "sticker") {
    ctx.font = `${el.size || 40}px serif`; ctx.textBaseline = "top"; ctx.textAlign = "center";
    ctx.fillText(el.emoji, el.x, el.y);
    if (el.label) { ctx.font = `800 ${(el.size || 40) * 0.32}px Nunito, sans-serif`; ctx.fillStyle = "#7c5cff"; ctx.fillText(el.label, el.x, el.y + (el.size || 40) * 1.02); }
  } else if (el.type === "image") {
    const im = imgCache[el.id];
    if (im) ctx.drawImage(im, el.x, el.y, el.w, el.h);
    else { ctx.fillStyle = "#eee"; ctx.fillRect(el.x, el.y, el.w, el.h); }
  }
  // candado en elementos bloqueados
  if (el.locked) {
    const b = bounds(el);
    ctx.globalAlpha = 1; ctx.font = "16px serif"; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("🔒", b.x + b.w - 18, b.y + 2);
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, w) {
  const head = 8 + w * 2, ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function textFont(el) {
  return `${el.italic ? "italic " : ""}${el.bold ? "800" : "700"} ${el.size || 22}px Nunito, sans-serif`;
}
function textLines(el) {
  ctx.font = textFont(el);
  const paras = (el.text || "").split("\n");
  if (!el.w) return paras;
  const out = [];
  for (const para of paras) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > el.w && line) { out.push(line); line = word; }
      else line = test;
    }
    out.push(line);
  }
  return out;
}

// Puntos de polígono para formas con bbox (triángulo/estrella/polígono)
function polyForShape(el) {
  const x = Math.min(el.x, el.x + el.w), y = Math.min(el.y, el.y + el.h), w = Math.abs(el.w), h = Math.abs(el.h);
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
  if (el.type === "triangle") return [{ x: cx, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const pts = []; const n = el.type === "star" ? 5 : 6;
  if (el.type === "star") {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const f = i % 2 ? 0.42 : 1; pts.push({ x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f }); }
  } else {
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  }
  return pts;
}
const BBOX_SHAPES = ["rect", "circle", "image", "triangle", "star", "polygon"];
function bounds(el) {
  if (BBOX_SHAPES.includes(el.type))
    return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
  if (el.type === "line" || el.type === "arrow")
    return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
  if (el.type === "text") {
    const sz = el.size || 22, lh = sz * 1.25;
    ctx.font = textFont(el);
    const lines = textLines(el);
    const w = el.w || Math.max(10, ...lines.map(l => ctx.measureText(l).width));
    return { x: el.x, y: el.y, w, h: Math.max(lh, lines.length * lh) };
  }
  if (el.type === "sticker") { const s = el.size || 40; return { x: el.x - s / 2, y: el.y, w: s, h: s * 1.4 }; }
  if (el.points) { const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function drawSelection() {
  if (!selectedIds.size) return;
  ctx.save(); ctx.strokeStyle = "#7c5cff"; ctx.lineWidth = 1.5 / scale; ctx.setLineDash([6 / scale, 4 / scale]);
  let single = selectedIds.size === 1 ? elements.find(e => selectedIds.has(e.id)) : null;
  selectedIds.forEach(id => {
    const el = elements.find(e => e.id === id); if (!el) return;
    const b = bounds(el);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  });
  if (single && (single.type === "image" || single.type === "text") && !single.locked) {
    const b = bounds(single); ctx.setLineDash([]); ctx.fillStyle = "#7c5cff";
    ctx.fillRect(b.x + b.w - 6, b.y + b.h - 6, 14 / scale + 6, 14 / scale + 6);
  }
  // Nodos editables (selección directa)
  if (single && tool === "directselect" && !single.locked) {
    ctx.setLineDash([]); const r = 5 / scale;
    getNodes(single).forEach(n => {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#7c5cff"; ctx.lineWidth = 2 / scale;
      ctx.beginPath(); ctx.rect(n.x - r, n.y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    });
  }
  ctx.restore();
}

function drawMarquee() {
  if (!marquee) return;
  ctx.save(); ctx.strokeStyle = "#7c5cff"; ctx.fillStyle = "rgba(124,92,255,.1)"; ctx.lineWidth = 1 / scale; ctx.setLineDash([5 / scale, 4 / scale]);
  ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
  ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
  ctx.restore();
}

// ============================================================
//  ZOOM
// ============================================================
function zoomAt(cx, cy, factor) {
  const wx = (cx - tx) / scale, wy = (cy - ty) / scale;
  scale = clamp(scale * factor, 0.25, 5);
  tx = cx - wx * scale; ty = cy - wy * scale;
  clampView(); render(); updateZoomLabel();
}
function zoomCenter(f) { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
function zoomReset() { scale = 1; tx = 20; ty = 20; clampView(); render(); updateZoomLabel(); }
function updateZoomLabel() { document.getElementById("pzZoomReset").textContent = Math.round(scale * 100) + "%"; }

// ============================================================
//  HIT TESTING
// ============================================================
function hitResizeHandle(el, p) {
  if ((el.type !== "image" && el.type !== "text") || el.locked) return false;
  const b = bounds(el);
  return p.x >= b.x + b.w - 10 && p.x <= b.x + b.w + 14 && p.y >= b.y + b.h - 10 && p.y <= b.y + b.h + 14;
}
// Distancia punto→segmento
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function pointInRect(p, b) { return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }

// Hit por GEOMETRÍA real: basta tocar el trazo/borde (o relleno) del objeto, no su caja
function hitElement(el, p) {
  const tol = (el.width || 4) / 2 + 6 / scale;
  if (el.type === "path" || el.type === "highlighter") {
    const pts = el.points || []; const r = (el.type === "highlighter" ? (el.width || 2) * 1.5 : tol);
    if (el.fill && pts.length > 2 && pointInPoly(p, pts)) return true;
    for (let i = 0; i < pts.length - 1; i++) if (distSeg(p.x, p.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= r) return true;
    return pts.length === 1 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) <= r;
  }
  if (el.type === "line" || el.type === "arrow") return distSeg(p.x, p.y, el.x1, el.y1, el.x2, el.y2) <= tol;
  if (el.type === "triangle" || el.type === "star" || el.type === "polygon") {
    const poly = polyForShape(el);
    if (el.fill && pointInPoly(p, poly)) return true;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (distSeg(p.x, p.y, poly[j].x, poly[j].y, poly[i].x, poly[i].y) <= tol) return true;
    return false;
  }
  if (el.type === "rect") {
    const b = bounds(el);
    if (el.fill) return pointInRect(p, b);
    const inBox = p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
    const onEdge = Math.abs(p.x - b.x) <= tol || Math.abs(p.x - (b.x + b.w)) <= tol || Math.abs(p.y - b.y) <= tol || Math.abs(p.y - (b.y + b.h)) <= tol;
    return inBox && onEdge;
  }
  if (el.type === "circle") {
    const b = bounds(el), rx = b.w / 2, ry = b.h / 2, cx = b.x + rx, cy = b.y + ry;
    if (!rx || !ry) return false;
    const d = (p.x - cx) * (p.x - cx) / (rx * rx) + (p.y - cy) * (p.y - cy) / (ry * ry);
    if (el.fill) return d <= 1.05;
    const dout = ((p.x - cx) / (rx + tol)) ** 2 + ((p.y - cy) / (ry + tol)) ** 2;
    const din = ((p.x - cx) / Math.max(1, rx - tol)) ** 2 + ((p.y - cy) / Math.max(1, ry - tol)) ** 2;
    return dout <= 1 && din >= 1;
  }
  // text / sticker / image → caja (regiones llenas)
  const b = bounds(el), pad = 4 / scale;
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}
function pointInPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (((pts[i].y > p.y) !== (pts[j].y > p.y)) && (p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) c = !c;
  }
  return c;
}

// --- Nodos editables (selección directa) ---
function getNodes(el) {
  if (!el) return [];
  if (el.type === "path" || el.type === "highlighter") return el.points.map((p, i) => ({ x: p.x, y: p.y, i }));
  if (el.type === "line" || el.type === "arrow") return [{ x: el.x1, y: el.y1, i: 0 }, { x: el.x2, y: el.y2, i: 1 }];
  if (["rect", "circle", "triangle", "star", "polygon"].includes(el.type)) return [{ x: el.x, y: el.y, i: 0 }, { x: el.x + el.w, y: el.y, i: 1 }, { x: el.x + el.w, y: el.y + el.h, i: 2 }, { x: el.x, y: el.y + el.h, i: 3 }];
  return [];
}
function setNode(el, i, x, y) {
  if (el.type === "path" || el.type === "highlighter") el.points[i] = { x, y };
  else if (el.type === "line" || el.type === "arrow") { if (i === 0) { el.x1 = x; el.y1 = y; } else { el.x2 = x; el.y2 = y; } }
  else if (["rect", "circle", "triangle", "star", "polygon"].includes(el.type)) {
    // mover una esquina ajustando origen + tamaño
    let x0 = el.x, y0 = el.y, x1 = el.x + el.w, y1 = el.y + el.h;
    if (i === 0) { x0 = x; y0 = y; } else if (i === 1) { x1 = x; y0 = y; } else if (i === 2) { x1 = x; y1 = y; } else { x0 = x; y1 = y; }
    el.x = x0; el.y = y0; el.w = x1 - x0; el.h = y1 - y0;
  }
}
function hitNode(el, p) {
  const tol = 9 / scale;
  const ns = getNodes(el);
  for (const n of ns) if (Math.abs(n.x - p.x) <= tol && Math.abs(n.y - p.y) <= tol) return n.i;
  return -1;
}
function topElementAt(p, includeLocked) {
  const ord = [...elements].sort((a, b) => (b.z || 0) - (a.z || 0));
  for (const el of ord) { if (!includeLocked && el.locked) continue; if (hitElement(el, p)) return el; }
  return null;
}

// ============================================================
//  PUNTERO
// ============================================================
function down(e) {
  if (e.target === textInput) return;
  e.preventDefault();
  const p = pos(e), sp = screenPos(e);

  // Pan temporal con botón central del mouse
  if (e.button === 1) { dragMode = "pan"; dragStart = { sx: sp.x, sy: sp.y, tx, ty }; return; }
  if (tool === "pan") { dragMode = "pan"; dragStart = { sx: sp.x, sy: sp.y, tx, ty }; return; }
  if (tool === "laser") { sendCursor(p.x, p.y, true); return; }

  // Modo juego: solo el dibujante puede dibujar en su ronda
  if (typeof GAME !== "undefined" && GAME.blockPointer(tool)) return;

  if (tool === "select" || tool === "directselect") {
    const single = selectedIds.size === 1 && elements.find(el => selectedIds.has(el.id));
    // Selección directa: arrastrar un nodo del elemento seleccionado
    if (tool === "directselect" && single && !single.locked) {
      const ni = hitNode(single, p);
      if (ni >= 0) { dragMode = "node"; dragStart = { id: single.id, idx: ni, before: geom(single) }; return; }
    }
    if (single && hitResizeHandle(single, p)) {
      const bw = bounds(single).w;
      dragMode = "resize"; dragStart = { x: p.x, y: p.y, w: single.w || bw, h: single.h, ratio: single.w ? single.w / single.h : 1, size: single.size, type: single.type };
      return;
    }
    const hit = topElementAt(p, true);
    if (hit) {
      const groupIds = expandGroup(hit);   // si pertenece a un grupo, todos
      if (e.shiftKey) {
        // alternar pertenencia a la selección
        const allIn = groupIds.every(id => selectedIds.has(id));
        groupIds.forEach(id => allIn ? selectedIds.delete(id) : selectedIds.add(id));
      } else if (!selectedIds.has(hit.id)) {
        selectedIds.clear(); groupIds.forEach(id => selectedIds.add(id));
      }
      // Alt+arrastrar = duplicar y mover las copias
      if (e.altKey) duplicateSelection(0, 0);
      const movable = [...selectedIds].map(id => elements.find(el => el.id === id)).filter(el => el && !el.locked);
      dragMode = "move";
      dragStart = { x: p.x, y: p.y, snaps: movable.map(el => ({ id: el.id, geo: geom(el) })) };
    } else {
      if (!e.shiftKey) selectedIds.clear();
      dragMode = "marquee"; dragStart = { x: p.x, y: p.y };
      marquee = { x: p.x, y: p.y, w: 0, h: 0 };
    }
    render(); refreshSelBar();
    return;
  }

  if (tool === "eraser") { eraseAt(p); return; }
  if (tool === "text") { dragMode = "textbox"; dragStart = { x: p.x, y: p.y }; marquee = { x: p.x, y: p.y, w: 0, h: 0 }; return; }
  if (tool === "sticker") { placeSticker(p); return; }
  if (tool === "fill") { fillAt(p); return; }

  const id = CLIENT_ID + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  if (tool === "pencil" || tool === "highlighter")
    drawing = { id, type: tool === "highlighter" ? "highlighter" : "path", color, width: lineWidth, points: [p], fidelity: brushFidelity, z: ++zCounter };
  else if (tool === "line" || tool === "arrow")
    drawing = { id, type: tool, color, width: lineWidth, borderStyle, x1: p.x, y1: p.y, x2: p.x, y2: p.y, z: ++zCounter };
  else if (["rect", "circle", "triangle", "star", "polygon"].includes(tool))
    drawing = { id, type: tool, color, width: lineWidth, borderStyle, fill: fillOn ? fillColor : null, x: p.x, y: p.y, w: 0, h: 0, z: ++zCounter };
  render();
}

function move(e) {
  const p = pos(e), sp = screenPos(e);
  if (tool !== "laser") sendCursor(p.x, p.y, false);

  if (dragMode === "pan") { tx = dragStart.tx + (sp.x - dragStart.sx); ty = dragStart.ty + (sp.y - dragStart.sy); clampView(); render(); return; }
  if (dragMode === "node") { const el = elements.find(x => x.id === dragStart.id); if (el) { setNode(el, dragStart.idx, p.x, p.y); render(); } return; }
  if (dragMode === "textbox") { marquee = { x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) }; render(); return; }
  if (tool === "laser" && (e.buttons || e.touches)) { sendCursor(p.x, p.y, true); return; }

  if ((tool === "select" || tool === "directselect") && dragMode) {
    if (dragMode === "marquee") { marquee = { x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) }; render(); return; }
    if (dragMode === "move") {
      const dx = p.x - dragStart.x, dy = p.y - dragStart.y;
      dragStart.snaps.forEach(s => { const el = elements.find(x => x.id === s.id); if (el) applyGeom(el, s.geo, dx, dy); });
      render(); return;
    }
    if (dragMode === "resize") {
      const el = elements.find(x => selectedIds.has(x.id));
      if (el && el.type === "text") {
        // Escalar texto: la fuente y el ancho de caja crecen juntos
        const factor = Math.max(0.2, (dragStart.w + (p.x - dragStart.x)) / dragStart.w);
        el.size = Math.max(8, Math.round((dragStart.size || 24) * factor));
        el.w = Math.max(40, dragStart.w * factor);
        render(); return;
      }
      // Shift mantiene proporción (además del bloqueo 🔒)
      const keepRatio = (lockRatio || e.shiftKey) && dragStart.ratio;
      if (el) { el.w = Math.max(20, dragStart.w + (p.x - dragStart.x) * Math.sign(el.w || 1)); el.h = keepRatio ? Math.max(20, el.w / dragStart.ratio) : Math.max(20, dragStart.h + (p.y - dragStart.y) * Math.sign(el.h || 1)); render(); }
      return;
    }
  }

  if (tool === "eraser" && (e.buttons || e.touches)) { eraseAt(p); return; }
  if (!drawing) return;
  if (drawing.points) drawing.points.push(p);
  else if (drawing.type === "line" || drawing.type === "arrow") { drawing.x2 = p.x; drawing.y2 = p.y; }
  else {
    drawing.w = p.x - drawing.x; drawing.h = p.y - drawing.y;
    // Shift = cuadrado / círculo perfecto
    if (e.shiftKey) { const m = Math.max(Math.abs(drawing.w), Math.abs(drawing.h)); drawing.w = m * Math.sign(drawing.w || 1); drawing.h = m * Math.sign(drawing.h || 1); }
  }
  render();
}

function up() {
  if (dragMode === "pan") { dragMode = null; return; }
  if (dragMode === "node") {
    const el = elements.find(x => x.id === dragStart.id);
    if (el) {
      SYNC.setElement(serialize(el));
      const id = el.id, before = dragStart.before, after = geom(el);
      history.push({ undo: () => { const e = elements.find(x => x.id === id); if (e) { setGeom(e, before); SYNC.setElement(serialize(e)); render(); } }, redo: () => { const e = elements.find(x => x.id === id); if (e) { setGeom(e, after); SYNC.setElement(serialize(e)); render(); } } });
    }
    dragMode = null; dragStart = null; return;
  }
  if (dragMode === "textbox") {
    const m = marquee; marquee = null; dragMode = null;
    const w = m && m.w > 30 ? m.w : 240;
    const x = m ? m.x : dragStart.x, y = m ? m.y : dragStart.y;
    openTextEditor({ x, y, w });
    return;
  }

  if ((tool === "select" || tool === "directselect") && dragMode) {
    if (dragMode === "marquee") {
      const m = marquee; marquee = null;
      if (m && (m.w > 5 || m.h > 5)) {
        elements.forEach(el => { const b = bounds(el); if (b.x >= m.x - 2 && b.y >= m.y - 2 && b.x + b.w <= m.x + m.w + 2 && b.y + b.h <= m.y + m.h + 2) expandGroup(el).forEach(id => selectedIds.add(id)); });
      }
      dragMode = null; render(); refreshSelBar(); return;
    }
    if ((dragMode === "move" || dragMode === "resize") && dragStart) {
      // confirmar cambios (sync + historial)
      const ids = dragMode === "resize" ? [...selectedIds] : (dragStart.snaps || []).map(s => s.id);
      const before = (dragStart.snaps || []).map(s => s.geo);
      ids.forEach((id) => { const el = elements.find(x => x.id === id); if (el) SYNC.setElement(serialize(el)); });
      // historial de movimiento/resize
      if (dragMode === "move" && dragStart.snaps) {
        const afters = dragStart.snaps.map(s => { const el = elements.find(x => x.id === s.id); return el ? { id: s.id, before: s.geo, after: geom(el) } : null; }).filter(Boolean);
        if (afters.some(a => JSON.stringify(a.before) !== JSON.stringify(a.after)))
          history.push({ undo: () => afters.forEach(a => { const el = elements.find(x => x.id === a.id); if (el) { setGeom(el, a.before); SYNC.setElement(serialize(el)); } }), redo: () => afters.forEach(a => { const el = elements.find(x => x.id === a.id); if (el) { setGeom(el, a.after); SYNC.setElement(serialize(el)); } }) });
      } else if (dragMode === "resize") {
        const el = elements.find(x => selectedIds.has(x.id));
        if (el) {
          const after = { w: el.w, h: el.h, size: el.size };
          const start = { w: dragStart.w, h: dragStart.h, size: dragStart.size };
          history.push({ undo: () => { el.w = start.w; el.h = start.h; if (start.size != null) el.size = start.size; SYNC.setElement(serialize(el)); render(); }, redo: () => { el.w = after.w; el.h = after.h; if (after.size != null) el.size = after.size; SYNC.setElement(serialize(el)); render(); } });
        }
      }
      dragMode = null; dragStart = null; return;
    }
    dragMode = null; return;
  }

  if (drawing) {
    const b = bounds(drawing);
    const tiny = (drawing.points && drawing.points.length < 2) || (!drawing.points && b.w < 3 && b.h < 3);
    if (!tiny) {
      // Fidelidad del pincel: Precisión = trazo crudo · Equilibrado/Suavizado = curva real
      if (drawing.points && drawing.fidelity && drawing.fidelity !== "precise") {
        drawing.points = smoothPath(drawing.points, drawing.fidelity);
      }
      addElement(drawing, true);
    }
    drawing = null; render();
  }
}

// Suavizado real: simplifica (quita temblor) + interpola curva Catmull-Rom (estilo Illustrator)
function rdpSimplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let dmax = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = rdpSimplify(pts.slice(0, idx + 1), eps), right = rdpSimplify(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}
function catmullRom(pts, seg) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let t = 1; t <= seg; t++) {
      const u = t / seg, u2 = u * u, u3 = u2 * u;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3)
      });
    }
  }
  return out;
}
function smoothPath(pts, fidelity) {
  if (pts.length < 3) return pts;
  const eps = fidelity === "smooth" ? 4 : 1.6;
  const seg = fidelity === "smooth" ? 12 : 6;
  return catmullRom(rdpSimplify(pts, eps), seg);
}

function geom(el) { return JSON.parse(JSON.stringify({ points: el.points, x: el.x, y: el.y, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, w: el.w, h: el.h })); }
function setGeom(el, g) { ["points", "x", "y", "x1", "y1", "x2", "y2", "w", "h"].forEach(k => { if (g[k] !== undefined) el[k] = JSON.parse(JSON.stringify(g[k])); }); }
function applyGeom(el, g, dx, dy) {
  if (g.points) el.points = g.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  else if (el.type === "line" || el.type === "arrow") { el.x1 = g.x1 + dx; el.y1 = g.y1 + dy; el.x2 = g.x2 + dx; el.y2 = g.y2 + dy; }
  else { el.x = g.x + dx; el.y = g.y + dy; }
}

// Borrador = círculo (radio según grosor). En trazos a mano borra SOLO la parte tocada
// (parte el trazo); en formas/imágenes/texto borra el objeto solo si se toca su geometría.
function eraseAt(p) {
  const R = Math.max(7, lineWidth) / 1;   // radio en unidades de mundo
  let changed = false;
  for (const el of [...elements]) {
    if (el.locked) continue;
    if (el.type === "path" || el.type === "highlighter") {
      const raw = el.points || [];
      // densificar para poder partir trazos rectos (pocos puntos) también
      const pts = [];
      for (let i = 0; i < raw.length - 1; i++) {
        const a = raw[i], b = raw[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / (R / 2)));
        for (let s = 0; s < steps; s++) pts.push({ x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps });
      }
      if (raw.length) pts.push(raw[raw.length - 1]);
      let touch = false;
      for (const pt of pts) if (Math.hypot(pt.x - p.x, pt.y - p.y) <= R) { touch = true; break; }
      if (!touch) continue;
      // partir en sub-trazos quitando puntos dentro del círculo
      const runs = []; let run = [];
      for (const pt of pts) { if (Math.hypot(pt.x - p.x, pt.y - p.y) <= R) { if (run.length > 1) runs.push(run); run = []; } else run.push(pt); }
      if (run.length > 1) runs.push(run);
      elements = elements.filter(e => e.id !== el.id); selectedIds.delete(el.id); SYNC.removeElement(el.id);
      runs.forEach((r, i) => { const ne = serialize(el); ne.id = el.id + "x" + Date.now().toString(36) + i; ne.points = r; elements.push(ne); SYNC.setElement(ne); });
      changed = true;
    } else if (hitElement(el, p)) {
      // formas/imágenes/texto: borra el objeto (solo si tocas su geometría, no su caja vacía)
      elements = elements.filter(e => e.id !== el.id); selectedIds.delete(el.id); SYNC.removeElement(el.id);
      changed = true;
    }
  }
  if (changed) { render(); if (typeof renderLayers === "function") renderLayers(); }
}

// Bote de relleno: pinta el interior de la figura cerrada bajo el cursor
function fillAt(p) {
  const el = topElementAt(p, false);
  if (!el || el.locked) return;
  if (!["rect", "circle", "path", "highlighter"].includes(el.type)) return;
  const before = el.fill;
  el.fill = fillColor;
  SYNC.setElement(serialize(el)); render();
  history.push({ undo: () => { el.fill = before; SYNC.setElement(serialize(el)); render(); }, redo: () => { el.fill = fillColor; SYNC.setElement(serialize(el)); render(); } });
}

canvas.addEventListener("mousedown", down);
window.addEventListener("mousemove", move);
window.addEventListener("mouseup", up);

// Gestos táctiles (2 dedos = zoom + desplazar)
let gesture = null;
function pinchInfo(e) { const r = canvas.getBoundingClientRect(), a = e.touches[0], b = e.touches[1]; return { cx: (a.clientX + b.clientX) / 2 - r.left, cy: (a.clientY + b.clientY) / 2 - r.top, dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }; }
canvas.addEventListener("touchstart", e => { if (e.touches.length >= 2) { drawing = null; gesture = pinchInfo(e); e.preventDefault(); return; } down(e); }, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (gesture && e.touches.length >= 2) {
    const g = pinchInfo(e), wx = (gesture.cx - tx) / scale, wy = (gesture.cy - ty) / scale;
    scale = clamp(scale * (g.dist / gesture.dist), 0.25, 5);
    tx = g.cx - wx * scale; ty = g.cy - wy * scale; clampView(); render(); updateZoomLabel(); gesture = g; return;
  }
  move(e);
}, { passive: false });
canvas.addEventListener("touchend", e => { if (e.touches.length < 2) gesture = null; up(e); });
canvas.addEventListener("wheel", e => { e.preventDefault(); const s = screenPos(e); zoomAt(s.x, s.y, e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });

// M11 — indicador de tamaño de pincel/borrador siguiendo el cursor
(function brushCursor() {
  const cur = document.getElementById("pzBrushCursor"), stage = document.getElementById("pzStage");
  function upd(e) {
    const drawTool = tool === "pencil" || tool === "highlighter" || tool === "eraser";
    if (!drawTool) { cur.classList.remove("show"); return; }
    const r = stage.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
    let d;
    if (tool === "eraser") d = 2 * Math.max(7, lineWidth) * scale;
    else d = Math.max(2, (tool === "highlighter" ? lineWidth * 3 : lineWidth)) * scale;
    cur.style.width = cur.style.height = d + "px";
    cur.style.left = (t.clientX - r.left) + "px"; cur.style.top = (t.clientY - r.top) + "px";
    cur.classList.toggle("eraser", tool === "eraser");
    cur.classList.add("show");
  }
  stage.addEventListener("mousemove", upd);
  stage.addEventListener("mouseleave", () => cur.classList.remove("show"));
  canvas.addEventListener("touchmove", upd, { passive: true });
  canvas.addEventListener("touchend", () => cur.classList.remove("show"));
})();

// ============================================================
//  ALTA / BAJA DE ELEMENTOS  (con historial)
// ============================================================
function addElement(el, record) {
  if (!el.layer) el.layer = activeLayer;
  elements.push(el);
  if (imgCache[el.id] && el.type === "image") { } // ya cacheada
  SYNC.setElement(serialize(el));
  if (typeof renderLayers === "function") renderLayers();
  if (record) history.push({ undo: () => removeElement(el.id, false), redo: () => addElement(el, false) });
}
function removeElement(id, record) {
  const el = elements.find(e => e.id === id);
  if (!el) return;
  const snap = serialize(el);
  elements = elements.filter(e => e.id !== id);
  selectedIds.delete(id);
  SYNC.removeElement(id);
  if (record) history.push({ undo: () => { const e2 = { ...snap }; elements.push(e2); if (e2.type === "image") loadImg(e2); SYNC.setElement(snap); render(); }, redo: () => removeElement(id, false) });
  render(); if (typeof refreshSelBar === "function") refreshSelBar();
}

function serialize(el) { const c = { ...el }; delete c._img; delete c._hidden; return c; }

// ============================================================
//  HISTORIAL (deshacer / rehacer)
// ============================================================
const history = {
  undoStack: [], redoStack: [], busy: false,
  push(cmd) { if (this.busy) return; this.undoStack.push(cmd); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; updateUndoRedo(); },
  undo() { const c = this.undoStack.pop(); if (!c) return; this.busy = true; c.undo(); this.busy = false; this.redoStack.push(c); updateUndoRedo(); },
  redo() { const c = this.redoStack.pop(); if (!c) return; this.busy = true; c.redo(); this.busy = false; this.undoStack.push(c); updateUndoRedo(); }
};
function updateUndoRedo() {
  document.getElementById("pzUndo").disabled = !history.undoStack.length;
  document.getElementById("pzRedo").disabled = !history.redoStack.length;
}
document.getElementById("pzUndo").addEventListener("click", () => history.undo());
document.getElementById("pzRedo").addEventListener("click", () => history.redo());

// ============================================================
//  GRUPOS  ·  PORTAPAPELES  ·  CAPAS  ·  OPACIDAD
// ============================================================
let clipboard = [];

function expandGroup(el) {
  if (el.groupId) return elements.filter(e => e.groupId === el.groupId).map(e => e.id);
  return [el.id];
}
function selectedElements() { return [...selectedIds].map(id => elements.find(e => e.id === id)).filter(Boolean); }
function syncMany(els) { els.forEach(el => SYNC.setElement(serialize(el))); render(); refreshSelBar(); if (typeof renderLayers === "function") renderLayers(); }

function groupSelection() {
  const els = selectedElements().filter(e => !e.locked);
  if (els.length < 2) return;
  const gid = "g-" + Date.now().toString(36);
  els.forEach(e => e.groupId = gid);
  syncMany(els);
  history.push({ undo: () => { els.forEach(e => delete e.groupId); syncMany(els); }, redo: () => { els.forEach(e => e.groupId = gid); syncMany(els); } });
}
function ungroupSelection() {
  const els = selectedElements().filter(e => e.groupId);
  if (!els.length) return;
  const prev = els.map(e => ({ el: e, g: e.groupId }));
  els.forEach(e => delete e.groupId);
  syncMany(els);
  history.push({ undo: () => { prev.forEach(p => p.el.groupId = p.g); syncMany(els); }, redo: () => { els.forEach(e => delete e.groupId); syncMany(els); } });
}

function duplicateSelection(dx, dy) {
  const els = selectedElements();
  if (!els.length) return;
  const gmap = {};
  const copies = els.map(src => {
    const c = JSON.parse(JSON.stringify(serialize(src)));
    c.id = CLIENT_ID + "-c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    c.z = ++zCounter;
    offsetGeom(c, dx, dy);
    if (src.groupId) { gmap[src.groupId] = gmap[src.groupId] || ("g-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 3)); c.groupId = gmap[src.groupId]; }
    if (c.type === "image") loadImg(c);
    return c;
  });
  copies.forEach(c => { elements.push(c); SYNC.setElement(serialize(c)); });
  selectedIds = new Set(copies.map(c => c.id));
  history.push({ undo: () => copies.forEach(c => removeElement(c.id, false)), redo: () => copies.forEach(c => { elements.push(c); if (c.type === "image") loadImg(c); SYNC.setElement(serialize(c)); render(); }) });
  render(); refreshSelBar();
}
function offsetGeom(el, dx, dy) {
  if (!dx && !dy) return;
  if (el.points) el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  else if (el.type === "line" || el.type === "arrow") { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; }
  else { el.x += dx; el.y += dy; }
}

function copySelection() { clipboard = selectedElements().map(e => JSON.parse(JSON.stringify(serialize(e)))); }
function cutSelection() { copySelection(); selectedElements().filter(e => !e.locked).forEach(e => removeElement(e.id, true)); }
function pasteClipboard() {
  if (!clipboard.length) return;
  const gmap = {};
  const copies = clipboard.map(src => {
    const c = JSON.parse(JSON.stringify(src));
    c.id = CLIENT_ID + "-p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
    c.z = ++zCounter; offsetGeom(c, 24, 24);
    if (src.groupId) { gmap[src.groupId] = gmap[src.groupId] || ("g-" + Math.random().toString(36).slice(2, 6)); c.groupId = gmap[src.groupId]; }
    if (c.type === "image") loadImg(c);
    return c;
  });
  copies.forEach(c => { elements.push(c); SYNC.setElement(serialize(c)); });
  selectedIds = new Set(copies.map(c => c.id));
  history.push({ undo: () => copies.forEach(c => removeElement(c.id, false)), redo: () => copies.forEach(c => { elements.push(c); if (c.type === "image") loadImg(c); SYNC.setElement(serialize(c)); render(); }) });
  render(); refreshSelBar();
}
function selectAll() { selectedIds = new Set(elements.map(e => e.id)); setTool("select"); render(); refreshSelBar(); }

function orderSelection(mode) {
  const els = selectedElements(); if (!els.length) return;
  const zs = elements.map(e => e.z || 0), maxZ = Math.max(0, ...zs), minZ = Math.min(0, ...zs);
  const before = els.map(e => ({ id: e.id, z: e.z }));
  if (mode === "front") els.forEach(e => e.z = ++zCounter);
  else if (mode === "back") { let nz = minZ - els.length; els.forEach(e => e.z = nz++); }
  else if (mode === "forward") els.forEach(e => e.z = (e.z || 0) + 1.5);
  else if (mode === "backward") els.forEach(e => e.z = (e.z || 0) - 1.5);
  zCounter = Math.max(zCounter, ...elements.map(e => e.z || 0));
  syncMany(els);
  history.push({ undo: () => { before.forEach(b => { const el = elements.find(e => e.id === b.id); if (el) el.z = b.z; }); syncMany(els); }, redo: () => orderSelection(mode) });
}

function setOpacity(v) {
  const els = selectedElements(); if (!els.length) return;
  els.forEach(e => e.opacity = v);
  els.forEach(el => SYNC.setElement(serialize(el))); render();
}

// ---- Alinear / Distribuir ----
function alignSel(mode) {
  const els = selectedElements().filter(e => !e.locked); if (els.length < 2) return;
  const bs = els.map(e => ({ e, b: bounds(e) }));
  const minX = Math.min(...bs.map(o => o.b.x)), maxX = Math.max(...bs.map(o => o.b.x + o.b.w));
  const minY = Math.min(...bs.map(o => o.b.y)), maxY = Math.max(...bs.map(o => o.b.y + o.b.h));
  bs.forEach(({ e, b }) => {
    let dx = 0, dy = 0;
    if (mode === "left") dx = minX - b.x;
    else if (mode === "right") dx = maxX - (b.x + b.w);
    else if (mode === "centerH") dx = (minX + maxX) / 2 - (b.x + b.w / 2);
    else if (mode === "top") dy = minY - b.y;
    else if (mode === "bottom") dy = maxY - (b.y + b.h);
    else if (mode === "centerV") dy = (minY + maxY) / 2 - (b.y + b.h / 2);
    if (dx || dy) { applyGeom(e, geom(e), dx, dy); SYNC.setElement(serialize(e)); }
  });
  render(); refreshSelBar();
}
function distributeSel(axis) {
  const els = selectedElements().filter(e => !e.locked); if (els.length < 3) return;
  const bs = els.map(e => ({ e, b: bounds(e) })).sort((a, c) => axis === "h" ? (a.b.x - c.b.x) : (a.b.y - c.b.y));
  const first = bs[0].b, last = bs[bs.length - 1].b;
  const span = axis === "h" ? ((last.x + last.w) - first.x) : ((last.y + last.h) - first.y);
  const totalSize = bs.reduce((s, o) => s + (axis === "h" ? o.b.w : o.b.h), 0);
  const gap = (span - totalSize) / (bs.length - 1);
  let cur = axis === "h" ? first.x : first.y;
  bs.forEach(({ e, b }) => {
    const pos0 = axis === "h" ? b.x : b.y;
    const d = cur - pos0;
    if (d) { applyGeom(e, geom(e), axis === "h" ? d : 0, axis === "h" ? 0 : d); SYNC.setElement(serialize(e)); }
    cur += (axis === "h" ? b.w : b.h) + gap;
  });
  render(); refreshSelBar();
}

// ---- Buscatrazos (booleanas) → resultado rasterizado como imagen ----
function pathShape(c, el, ox, oy) {
  c.beginPath();
  if (el.type === "rect") c.rect(el.x - ox, el.y - oy, el.w, el.h);
  else if (el.type === "circle") { const b = bounds(el); c.ellipse(b.x - ox + b.w / 2, b.y - oy + b.h / 2, Math.max(1, b.w / 2), Math.max(1, b.h / 2), 0, 0, Math.PI * 2); }
  else { const poly = (el.type === "path" || el.type === "highlighter") ? el.points : polyForShape(el); poly.forEach((q, i) => i ? c.lineTo(q.x - ox, q.y - oy) : c.moveTo(q.x - ox, q.y - oy)); c.closePath(); }
}
function pathfinder(op) {
  const els = selectedElements().filter(e => ["rect", "circle", "triangle", "star", "polygon", "path", "highlighter"].includes(e.type) && !e.locked);
  if (els.length < 2) return;
  const bs = els.map(e => bounds(e));
  const minX = Math.floor(Math.min(...bs.map(b => b.x))), minY = Math.floor(Math.min(...bs.map(b => b.y)));
  const maxX = Math.ceil(Math.max(...bs.map(b => b.x + b.w))), maxY = Math.ceil(Math.max(...bs.map(b => b.y + b.h)));
  let W = maxX - minX, H = maxY - minY; if (W < 2 || H < 2) return;
  const scl = Math.min(1, 1400 / Math.max(W, H));
  const cv = document.createElement("canvas"); cv.width = Math.round(W * scl); cv.height = Math.round(H * scl);
  const c = cv.getContext("2d"); c.scale(scl, scl);
  const col = els[0].fill || els[0].color || "#7c5cff";
  c.fillStyle = col;
  pathShape(c, els[0], minX, minY); c.fill();
  for (let i = 1; i < els.length; i++) {
    c.globalCompositeOperation = op === "unite" ? "source-over" : op === "subtract" ? "destination-out" : op === "intersect" ? "destination-in" : "xor";
    c.fillStyle = col; pathShape(c, els[i], minX, minY); c.fill();
  }
  c.globalCompositeOperation = "source-over";
  const src = cv.toDataURL("image/png");
  const removed = els.map(serialize);
  els.forEach(e => removeElement(e.id, false));
  const img = new Image();
  img.onload = () => {
    const el = { id: CLIENT_ID + "-pf-" + Date.now().toString(36), type: "image", x: minX, y: minY, w: W, h: H, src, z: ++zCounter, layer: activeLayer };
    imgCache[el.id] = img; elements.push(el); SYNC.setElement(serialize(el));
    selectedIds = new Set([el.id]); render(); refreshSelBar(); renderLayers();
    history.push({ undo: () => { removeElement(el.id, false); removed.forEach(r => { elements.push({ ...r }); if (r.type === "image") loadImg(r); SYNC.setElement(r); }); render(); }, redo: () => pathfinder(op) });
  };
  img.src = src;
}

// Barra contextual de selección
function refreshSelBar() {
  const bar = document.getElementById("pzSelBar");
  const n = selectedIds.size;
  bar.classList.toggle("show", n > 0);
  if (typeof renderLayers === "function") renderLayers();
  if (!n) return;
  document.getElementById("pzSelCount").textContent = n === 1 ? "1 elemento" : n + " elementos";
  const els = selectedElements();
  const op = els.length ? Math.round((els[0].opacity != null ? els[0].opacity : 1) * 100) : 100;
  document.getElementById("pzOpacity").value = op;
  document.getElementById("pzOpacityVal").textContent = op + "%";
  document.querySelectorAll(".pz-multi").forEach(b => b.style.display = n >= 2 ? "" : "none");
}
(function wireSelBar() {
  const op = document.getElementById("pzOpacity");
  op.addEventListener("input", () => { document.getElementById("pzOpacityVal").textContent = op.value + "%"; setOpacity(+op.value / 100); });
  op.addEventListener("change", () => { const els = selectedElements(); if (els.length) history.push({ undo: () => {}, redo: () => {} }); }); // opacidad: cambio simple
  document.getElementById("pzFront").onclick = () => orderSelection("front");
  document.getElementById("pzForward").onclick = () => orderSelection("forward");
  document.getElementById("pzBackward").onclick = () => orderSelection("backward");
  document.getElementById("pzBack2").onclick = () => orderSelection("back");
  document.getElementById("pzGroup").onclick = () => groupSelection();
  document.getElementById("pzUngroup").onclick = () => ungroupSelection();
  document.getElementById("pzDup").onclick = () => duplicateSelection(24, 24);
  document.getElementById("pzDel").onclick = () => { [...selectedIds].forEach(id => { const el = elements.find(e => e.id === id); if (el && !el.locked) removeElement(id, true); }); refreshSelBar(); };
  document.getElementById("pzAlignL").onclick = () => alignSel("left");
  document.getElementById("pzAlignCH").onclick = () => alignSel("centerH");
  document.getElementById("pzAlignR").onclick = () => alignSel("right");
  document.getElementById("pzAlignT").onclick = () => alignSel("top");
  document.getElementById("pzAlignCV").onclick = () => alignSel("centerV");
  document.getElementById("pzAlignB").onclick = () => alignSel("bottom");
  document.getElementById("pzDistH").onclick = () => distributeSel("h");
  document.getElementById("pzDistV").onclick = () => distributeSel("v");
  document.getElementById("pzPfU").onclick = () => pathfinder("unite");
  document.getElementById("pzPfS").onclick = () => pathfinder("subtract");
  document.getElementById("pzPfI").onclick = () => pathfinder("intersect");
  document.getElementById("pzPfX").onclick = () => pathfinder("exclude");
})();

// ---- Atajos de teclado ----
const TOOL_KEYS = { v: "select", a: "directselect", b: "pencil", t: "text", m: "rect", l: "circle", e: "eraser", h: "pan", z: "zoomtool" };
window.addEventListener("keydown", e => {
  if (document.activeElement === textInput) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;

  if (ctrl) {
    if (k === "z") { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
    if (k === "y") { e.preventDefault(); history.redo(); return; }
    if (k === "c") { e.preventDefault(); copySelection(); return; }
    if (k === "x") { e.preventDefault(); cutSelection(); return; }
    if (k === "v") { e.preventDefault(); pasteClipboard(); return; }
    if (k === "d") { e.preventDefault(); duplicateSelection(24, 24); return; }
    if (k === "a") { e.preventDefault(); selectAll(); return; }
    if (k === "g") { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedIds.size) { e.preventDefault(); [...selectedIds].forEach(id => { const el = elements.find(x => x.id === id); if (el && !el.locked) removeElement(id, true); }); refreshSelBar(); }
    return;
  }

  // Atajos de herramienta
  if (e.altKey && k === "e") { setTool("eraser"); return; }      // borrador en línea (mismo borrador)
  if (e.shiftKey && k === "l") { setTool("laser"); return; }     // puntero láser
  if (TOOL_KEYS[k] && !e.shiftKey && !e.altKey) {
    const t = TOOL_KEYS[k];
    if (t === "zoomtool") return;                                 // Z reservado para zoom con rueda
    // respeta permisos
    const btn = document.querySelector(`.pz-tool[data-tool="${t}"]`);
    if (btn && btn.disabled) return;
    setTool(t);
  }
});

// ============================================================
//  TEXTO
// ============================================================
const textBar = document.getElementById("pzTextBar");
let txtEdit = null;   // { x, y, w, id|null, fmt:{size,bold,italic,align,color} }

function defaultFmt() { return { size: 24, bold: false, italic: false, align: "left", color }; }

// Abrir editor: para crear (box) o editar un elemento existente
function openTextEditor(opts) {
  if (typeof GAME !== "undefined" && GAME.blockTool("text")) return;
  commitText();
  const fmt = opts.el ? { size: opts.el.size || 24, bold: !!opts.el.bold, italic: !!opts.el.italic, align: opts.el.align || "left", color: opts.el.color || color } : defaultFmt();
  txtEdit = { x: opts.x, y: opts.y, w: opts.w || 240, id: opts.el ? opts.el.id : null, fmt };
  if (opts.el) opts.el._hidden = true;   // ocultar el original mientras se edita
  applyEditorStyle();
  textInput.value = opts.el ? opts.el.text : "";
  textInput.style.display = "block";
  positionEditor();
  showTextBar();
  setTimeout(() => { textInput.focus(); autoGrow(); }, 0);
  render();
}
function applyEditorStyle() {
  const f = txtEdit.fmt;
  textInput.style.width = (txtEdit.w * scale) + "px";
  textInput.style.fontSize = (f.size * scale) + "px";
  textInput.style.fontWeight = f.bold ? "800" : "700";
  textInput.style.fontStyle = f.italic ? "italic" : "normal";
  textInput.style.textAlign = f.align;
  textInput.style.color = f.color;
}
function positionEditor() {
  const r = canvas.getBoundingClientRect();
  textInput.style.left = (r.left + txtEdit.x * scale + tx) + "px";
  textInput.style.top = (r.top + txtEdit.y * scale + ty) + "px";
  textBar.style.left = (r.left + txtEdit.x * scale + tx) + "px";
  textBar.style.top = Math.max(56, r.top + txtEdit.y * scale + ty - 46) + "px";
}
function autoGrow() { textInput.style.height = "auto"; textInput.style.height = textInput.scrollHeight + "px"; }
textInput.addEventListener("input", autoGrow);

function commitText() {
  if (!txtEdit) return;
  const val = textInput.value.replace(/\s+$/, "");
  const f = txtEdit.fmt, ed = txtEdit;
  textInput.style.display = "none"; hideTextBar(); txtEdit = null;
  if (ed.id) {
    const el = elements.find(e => e.id === ed.id);
    if (el) {
      delete el._hidden;
      if (!val.trim()) { removeElement(el.id, true); return; }
      const before = serialize(el);
      Object.assign(el, { text: val, size: f.size, bold: f.bold, italic: f.italic, align: f.align, color: f.color });
      SYNC.setElement(serialize(el)); render();
      history.push({ undo: () => { Object.assign(el, before); SYNC.setElement(serialize(el)); render(); }, redo: () => { Object.assign(el, { text: val, size: f.size, bold: f.bold, italic: f.italic, align: f.align, color: f.color }); SYNC.setElement(serialize(el)); render(); } });
    }
  } else if (val.trim()) {
    addElement({ id: CLIENT_ID + "-" + Date.now().toString(36), type: "text", x: ed.x, y: ed.y, w: ed.w, text: val, size: f.size, bold: f.bold, italic: f.italic, align: f.align, color: f.color, z: ++zCounter }, true);
  }
  render();
}
textInput.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== textInput && !textBar.contains(document.activeElement)) commitText(); }, 120));
textInput.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); commitText(); } });

// Barra de formato
function showTextBar() { textBar.classList.add("show"); syncTextBar(); }
function hideTextBar() { textBar.classList.remove("show"); }
function syncTextBar() {
  const f = txtEdit ? txtEdit.fmt : null;
  if (!f) return;
  document.getElementById("pzTxtBold").classList.toggle("on", f.bold);
  document.getElementById("pzTxtItalic").classList.toggle("on", f.italic);
  document.getElementById("pzTxtLeft").classList.toggle("on", f.align === "left");
  document.getElementById("pzTxtCenter").classList.toggle("on", f.align === "center");
  document.getElementById("pzTxtRight").classList.toggle("on", f.align === "right");
  document.getElementById("pzTxtColor").value = toHex(f.color);
}
function fmtApply(fn) { if (!txtEdit) return; fn(txtEdit.fmt); applyEditorStyle(); autoGrow(); syncTextBar(); textInput.focus(); }
document.getElementById("pzTxtBold").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.bold = !f.bold); });
document.getElementById("pzTxtItalic").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.italic = !f.italic); });
document.getElementById("pzTxtLeft").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.align = "left"); });
document.getElementById("pzTxtCenter").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.align = "center"); });
document.getElementById("pzTxtRight").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.align = "right"); });
document.getElementById("pzTxtMinus").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.size = Math.max(8, f.size - 4)); });
document.getElementById("pzTxtPlus").addEventListener("mousedown", e => { e.preventDefault(); fmtApply(f => f.size = Math.min(160, f.size + 4)); });
document.getElementById("pzTxtColor").addEventListener("input", e => fmtApply(f => f.color = e.target.value));

// Doble clic para reeditar un texto existente
canvas.addEventListener("dblclick", e => {
  if (tool === "pan") return;
  const p = pos(e);
  const el = [...elements].sort((a, b) => (b.z || 0) - (a.z || 0)).find(x => x.type === "text" && !x.locked && hitElement(x, p));
  if (el) { selectedIds.clear(); openTextEditor({ x: el.x, y: el.y, w: el.w || 240, el }); }
});

// ============================================================
//  IMÁGENES
// ============================================================
document.getElementById("pzImage").addEventListener("change", e => { importFiles(e.target.files); e.target.value = ""; });

// Importa archivos de imagen (selector, drag&drop, pegar). Reparte y selecciona.
function importFiles(files) {
  const imgs = [...files].filter(f => /^image\//.test(f.type));
  imgs.forEach((file, i) => { const rd = new FileReader(); rd.onload = () => addImageFromSrc(rd.result, i, imgs.length); rd.readAsDataURL(file); });
}

// Optimiza imágenes grandes: reescala a máx 1600px de lado conservando proporción + transparencia
function optimizeSrc(img, src, cb) {
  const MAX = 1600;
  if (img.width <= MAX && img.height <= MAX) { cb(src); return; }
  const sc = MAX / Math.max(img.width, img.height);
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  try { cb(c.toDataURL("image/png")); } catch (e) { cb(src); }
}

function addImageFromSrc(src, idx, total) {
  if (typeof GAME !== "undefined" && GAME.blockTool("image")) return;
  idx = idx || 0; total = total || 1;
  const img = new Image();
  img.onload = () => optimizeSrc(img, src, finalSrc => {
    const fimg = new Image();
    fimg.onload = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cx = (w / 2 - tx) / scale, cy = (h / 2 - ty) / scale;
      const sc = Math.min(1, (w * 0.5) / fimg.width, (h * 0.5) / fimg.height) / scale;
      const iw = fimg.width * sc, ih = fimg.height * sc;
      // reparto en cascada si hay varias (evita superposición total)
      const off = (total > 1 ? (idx - (total - 1) / 2) * 28 : 0);
      const el = { id: CLIENT_ID + "-img-" + Date.now().toString(36) + idx, type: "image", x: cx - iw / 2 + off, y: cy - ih / 2 + off, w: iw, h: ih, src: finalSrc, z: ++zCounter };
      imgCache[el.id] = fimg;
      addElement(el, true);
      selectedIds = new Set([el.id]); setTool("select"); render(); refreshSelBar();
    };
    fimg.src = finalSrc;
  });
  img.src = src;
}

// Arrastrar y soltar imágenes (PC)
(function dndImages() {
  const stage = document.getElementById("pzStage");
  let overlay = document.getElementById("pzDrop");
  if (!overlay) { overlay = document.createElement("div"); overlay.id = "pzDrop"; overlay.className = "pz-drop"; overlay.innerHTML = "📷 Suelta aquí para insertar imagen"; stage.appendChild(overlay); }
  let depth = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  stage.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.classList.add("show"); });
  stage.addEventListener("dragover", e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  stage.addEventListener("dragleave", e => { if (!hasFiles(e)) return; depth--; if (depth <= 0) { depth = 0; overlay.classList.remove("show"); } });
  stage.addEventListener("drop", e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; overlay.classList.remove("show"); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });
})();

// Pegar imágenes desde portapapeles (Ctrl+V): capturas, navegador, Word, etc.
window.addEventListener("paste", e => {
  if (document.activeElement === textInput) return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const files = [];
  for (const it of items) { if (it.type && it.type.indexOf("image") === 0) { const f = it.getAsFile(); if (f) files.push(f); } }
  if (files.length) { e.preventDefault(); importFiles(files); }
});
function loadImg(el) {
  if (imgCache[el.id]) { render(); return; }
  const img = new Image(); img.onload = () => { imgCache[el.id] = img; render(); }; img.src = el.src;
}

// ============================================================
//  STICKERS
// ============================================================
const STICKERS = [
  { emoji: "⭐", label: "Excelente" }, { emoji: "🎉", label: "Muy bien" }, { emoji: "🏆", label: "Logrado" },
  { emoji: "✅", label: "Correcto" }, { emoji: "💪", label: "Sigue así" }, { emoji: "🌟", label: "Estrella" },
  { emoji: "❤️", label: "Me encanta" }, { emoji: "👏", label: "Bravo" }, { emoji: "🧠", label: "Genial" }
];
(function buildStickers() {
  const pal = document.getElementById("pzStickerPalette");
  STICKERS.forEach(s => {
    const b = document.createElement("button");
    b.className = "pz-sticker-item";
    b.innerHTML = `<span class="em">${s.emoji}</span>${s.label}`;
    b.addEventListener("click", () => { pendingSticker = s; setTool("sticker"); pal.classList.remove("open"); });
    pal.appendChild(b);
  });
})();
document.getElementById("pzStickerBtn").addEventListener("click", () => document.getElementById("pzStickerPalette").classList.toggle("open"));
function placeSticker(p) {
  if (typeof GAME !== "undefined" && GAME.blockTool("sticker")) return;
  if (!pendingSticker) return;
  addElement({ id: CLIENT_ID + "-stk-" + Date.now().toString(36), type: "sticker", x: p.x, y: p.y, emoji: pendingSticker.emoji, label: pendingSticker.label, size: 48, color: "#7c5cff", z: ++zCounter }, true);
}

// ============================================================
//  LIMPIAR TODO
// ============================================================
document.getElementById("pzClear").addEventListener("click", () => {
  if (!elements.length) return;
  if (!confirm("¿Borrar toda la pizarra?")) return;
  const snap = elements.map(serialize);
  elements = []; selectedIds.clear(); SYNC.clearAll(); render();
  history.push({ undo: () => { snap.forEach(s => { elements.push({ ...s }); if (s.type === "image") loadImg(s); SYNC.setElement(s); }); render(); }, redo: () => { elements = []; SYNC.clearAll(); render(); } });
});

// ============================================================
//  HERRAMIENTAS (UI)
// ============================================================
function setTool(t) {
  tool = t;
  document.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
  const sb = document.getElementById("pzShapeBtn"); if (sb) sb.classList.toggle("active", ["rect", "circle", "triangle", "star", "polygon"].includes(t));
  if (t !== "select" && t !== "directselect") selectedIds.clear();
  canvas.style.cursor = t === "pan" ? "grab" : ((t === "select" || t === "directselect") ? "default" : "crosshair");
  render(); refreshSelBar();
}
document.querySelectorAll("[data-tool]").forEach(btn => btn.addEventListener("click", () => setTool(btn.dataset.tool)));

// Submenú de formas
(function shapeFly() {
  const btn = document.getElementById("pzShapeBtn"), fly = document.getElementById("pzShapeFly");
  const ICON = { rect: "▭", circle: "◯", triangle: "△", star: "★", polygon: "⬡" };
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect(), st = document.getElementById("pzStage").getBoundingClientRect();
    fly.style.top = (r.top - st.top) + "px";
    fly.classList.toggle("open");
  });
  fly.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    btn.textContent = ICON[b.dataset.tool] || "▭"; btn.classList.add("active");
    fly.classList.remove("open");
  }));
  document.addEventListener("click", e => { if (!fly.contains(e.target) && e.target !== btn) fly.classList.remove("open"); });
})();

const swatches = document.getElementById("pzSwatches");
["#3c3160", "#ff4f9a", "#7c5cff", "#2eb872", "#ffc83d", "#ff7a3d", "#4d9fff", "#ffffff"].forEach((c, i) => {
  const s = document.createElement("div"); s.className = "pz-swatch" + (i === 0 ? " active" : ""); s.style.background = c; s.dataset.c = c;
  s.addEventListener("click", () => setStrokeColor(c));
  swatches.appendChild(s);
});

// Aplica color de borde: a la selección si la hay, y como color por defecto
const FILLABLE = ["rect", "circle", "triangle", "star", "polygon", "path", "highlighter"];
function setStrokeColor(c) {
  color = c;
  document.querySelectorAll("#pzSwatches .pz-swatch").forEach(x => x.classList.toggle("active", x.dataset.c === c));
  const sc = document.getElementById("pzStrokeColor"); if (sc && c !== "none") sc.value = toHex(c);
  if (c !== "none") pushRecent(c);
  const els = selectedElements();
  if (els.length) { els.forEach(e => { e.color = c; SYNC.setElement(serialize(e)); }); render(); }
  updateFgBg();
}
function setFillColorVal(c) {
  fillColor = c; fillOn = true;
  const fo = document.getElementById("pzFillOn"); if (fo) fo.checked = false;
  pushRecent(c);
  const els = selectedElements().filter(e => FILLABLE.includes(e.type));
  if (els.length) { els.forEach(e => { e.fill = c; SYNC.setElement(serialize(e)); }); render(); }
  updateFgBg();
}
// M7 — refresca las dos muestras (relleno frente / borde atrás)
function updateFgBg() {
  const fs = document.getElementById("pzFbStroke"), ff = document.getElementById("pzFbFill");
  if (!fs || !ff) return;
  fs.classList.toggle("none", color === "none");
  fs.style.background = color === "none" ? "#fff" : color;
  ff.classList.toggle("none", !fillOn);
  ff.style.background = fillOn ? fillColor : "#fff";
  fs.classList.toggle("active", fgbgActive === "stroke");
  ff.classList.toggle("active", fgbgActive === "fill");
}
let fgbgActive = "stroke";
function toHex(c) { if (c && c[0] === "#" && c.length === 7) return c; const m = document.createElement("canvas").getContext("2d"); m.fillStyle = c; return m.fillStyle; }
function pushRecent(c) {
  if (!c || c === "transparent") return;
  recentColors = [c, ...recentColors.filter(x => x !== c)].slice(0, 8);
  const row = document.getElementById("pzRecents"); if (!row) return;
  row.innerHTML = "";
  recentColors.forEach(rc => { const s = document.createElement("div"); s.className = "pz-swatch"; s.style.background = rc; s.title = rc; s.addEventListener("click", () => setStrokeColor(rc)); row.appendChild(s); });
}
// M7 — widget relleno/borde
(function wireFgBg() {
  const inp = document.getElementById("pzFbInput"), fs = document.getElementById("pzFbStroke"), ff = document.getElementById("pzFbFill");
  if (!inp) return;
  function openPicker(which) {
    fgbgActive = which; updateFgBg();
    inp.value = toHex(which === "fill" ? (fillOn ? fillColor : "#ffd23d") : (color === "none" ? "#3c3160" : color));
    inp.oninput = () => { if (fgbgActive === "fill") setFillColorVal(inp.value); else setStrokeColor(inp.value); };
    inp.click();
  }
  fs.addEventListener("click", () => { if (fgbgActive === "stroke") openPicker("stroke"); else { fgbgActive = "stroke"; updateFgBg(); } });
  ff.addEventListener("click", () => { if (fgbgActive === "fill") openPicker("fill"); else { fgbgActive = "fill"; updateFgBg(); } });
  document.getElementById("pzFbSwap").addEventListener("click", () => {
    const t = color; color = fillOn ? fillColor : "none"; fillColor = (t === "none" ? fillColor : t); fillOn = (t !== "none");
    const els = selectedElements();
    els.forEach(e => { e.color = color; if (FILLABLE.includes(e.type)) e.fill = fillOn ? fillColor : null; SYNC.setElement(serialize(e)); });
    if (els.length) render();
    updateFgBg();
  });
  document.getElementById("pzFbNone").addEventListener("click", () => {
    if (fgbgActive === "fill") { fillOn = false; const els = selectedElements().filter(e => FILLABLE.includes(e.type)); els.forEach(e => { e.fill = null; SYNC.setElement(serialize(e)); }); if (els.length) render(); }
    else { color = "none"; const els = selectedElements(); els.forEach(e => { e.color = "none"; SYNC.setElement(serialize(e)); }); if (els.length) render(); }
    updateFgBg();
  });
  updateFgBg();
})();

// Panel de color y estilo
(function wireStyle() {
  const panel = document.getElementById("pzStylePanel");
  document.getElementById("pzStyleBtn").addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("pzStyleClose").addEventListener("click", () => panel.classList.remove("open"));
  document.getElementById("pzStrokeColor").addEventListener("input", e => setStrokeColor(e.target.value));
  document.getElementById("pzFillColor").addEventListener("input", e => setFillColorVal(e.target.value));
  document.getElementById("pzFillOn").addEventListener("change", e => {
    fillOn = !e.target.checked;   // casilla "Sin relleno"
    const els = selectedElements().filter(x => ["rect", "circle", "path", "highlighter"].includes(x.type));
    if (els.length) { els.forEach(x => { x.fill = fillOn ? fillColor : null; SYNC.setElement(serialize(x)); }); render(); }
  });
  document.getElementById("pzBorderStyle").addEventListener("change", e => {
    borderStyle = e.target.value;
    const els = selectedElements().filter(x => ["rect", "circle", "line", "arrow"].includes(x.type));
    if (els.length) { els.forEach(x => { x.borderStyle = borderStyle; SYNC.setElement(serialize(x)); }); render(); }
  });
  document.getElementById("pzFidelity").addEventListener("change", e => brushFidelity = e.target.value);
})();

document.getElementById("pzSize").addEventListener("input", e => {
  lineWidth = +e.target.value;
  const els = selectedElements();
  if (els.length) { els.forEach(x => { x.width = lineWidth; SYNC.setElement(serialize(x)); }); render(); }
});
document.getElementById("pzZoomIn").addEventListener("click", () => zoomCenter(1.2));
document.getElementById("pzZoomOut").addEventListener("click", () => zoomCenter(1 / 1.2));
document.getElementById("pzZoomReset").addEventListener("click", zoomReset);

document.getElementById("pzLock").addEventListener("click", () => {
  lockRatio = !lockRatio; const b = document.getElementById("pzLock");
  b.classList.toggle("active", lockRatio); b.textContent = lockRatio ? "🔒" : "🔓";
});

// Bloquear / liberar elemento seleccionado
document.getElementById("pzLockEl").addEventListener("click", () => {
  if (!selectedIds.size) return;
  selectedIds.forEach(id => { const el = elements.find(e => e.id === id); if (el) { el.locked = !el.locked; SYNC.setElement(serialize(el)); } });
  render();
});

// Fondo
document.getElementById("pzBg").addEventListener("change", e => { bgType = e.target.value; SYNC.setBg(bgType); render(); });

// ============================================================
//  CALCULADORA
// ============================================================
(function () {
  const panel = document.getElementById("pzCalcPanel"), display = document.getElementById("pzCalcDisplay"), keys = document.getElementById("pzCalcKeys");
  let expr = "";
  const layout = [["C", "←", "%", "÷"], ["7", "8", "9", "×"], ["4", "5", "6", "−"], ["1", "2", "3", "+"], ["0", ".", "=", ""]];
  const cls = { "÷": "op", "×": "op", "−": "op", "+": "op", "%": "op", "C": "clr", "←": "clr", "=": "eq" };
  layout.flat().forEach(k => { if (!k) { keys.appendChild(document.createElement("span")); return; } const b = document.createElement("button"); b.textContent = k; if (cls[k]) b.className = cls[k]; b.addEventListener("click", () => press(k)); keys.appendChild(b); });
  function press(k) { if (k === "C") expr = ""; else if (k === "←") expr = expr.slice(0, -1); else if (k === "=") return compute(); else expr += k; display.value = expr || "0"; }
  function compute() { try { const js = expr.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-").replace(/%/g, "/100"); if (!/^[-+*/.()0-9\s]+$/.test(js)) throw 0; const r = Function('"use strict";return (' + js + ')')(); expr = (Math.round(r * 1e6) / 1e6).toString(); display.value = expr; } catch { display.value = "Error"; expr = ""; } }
  document.getElementById("pzCalc").addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("pzCalcClose").addEventListener("click", () => panel.classList.remove("open"));
  const head = panel.querySelector(".pz-calc-head"); let dx, dy, moving = false;
  head.addEventListener("mousedown", e => { if (e.target.id === "pzCalcClose") return; moving = true; const r = panel.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; panel.style.right = "auto"; panel.style.bottom = "auto"; });
  window.addEventListener("mousemove", e => { if (!moving) return; panel.style.left = (e.clientX - dx) + "px"; panel.style.top = (e.clientY - dy) + "px"; });
  window.addEventListener("mouseup", () => moving = false);
})();

// ============================================================
//  PERMISOS (rol)
// ============================================================
const PERM_LABELS = { calculator: "Calculadora 🧮", eraser: "Borrador 🧽", text: "Texto 🔤", image: "Imágenes 🖼️", stickers: "Stickers 🏷️", clear: "Limpiar todo 🗑️" };
function applyPerms(perms) {
  PERMS = { ...PERMS, ...(perms || {}) };
  if (!IS_ADMIN) {
    document.querySelectorAll("[data-perm]").forEach(el => {
      const allowed = PERMS[el.dataset.perm] !== false;
      if (el.classList.contains("pz-label-btn")) el.classList.toggle("pz-disabled", !allowed);
      else el.disabled = !allowed;
    });
    if (tool && document.querySelector(`.pz-tool[data-tool="${tool}"][data-perm]`) && PERMS[tool] === false) setTool("select");
  }
  // reflejar en panel admin
  document.querySelectorAll("#pzPermsBody input").forEach(c => { c.checked = PERMS[c.dataset.perm] !== false; });
}
if (IS_ADMIN) {
  document.getElementById("pzRightPanel").style.display = "";
  document.getElementById("pzRoleBadge").style.display = "";
  const body = document.getElementById("pzPermsBody");
  Object.keys(PERM_LABELS).forEach(k => {
    const row = document.createElement("label"); row.className = "pz-perm-row";
    row.innerHTML = `<span>${PERM_LABELS[k]}</span>`;
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = true; c.dataset.perm = k;
    c.addEventListener("change", () => { PERMS[k] = c.checked; SYNC.setPermissions(PERMS); });
    row.appendChild(c); body.appendChild(row);
  });
  // M9 — menú desplegable único de configuración
  const menu = document.getElementById("pzAdminMenu"), abtn = document.getElementById("pzAdminBtn"), endb = document.getElementById("pzAdminEndGame");
  abtn.addEventListener("click", () => { menu.classList.toggle("open"); abtn.classList.toggle("open"); });
  endb.addEventListener("click", () => { if (typeof GAME !== "undefined" && GAME.endGame) GAME.endGame(); });
  // mostrar "Terminar partida" solo si hay juego activo
  GAME_endBtn = endb;
}
var GAME_endBtn = null;

// ============================================================
//  PARTICIPANTES + CURSORES
// ============================================================
function escapeHtml(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
function renderPresence(data) {
  const box = document.getElementById("pzPresence"), ahora = Date.now();
  const list = Object.values(data || {}).filter(p => p && p.name && (ahora - (p.t || 0) < 86400000));
  box.innerHTML = list.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
    .map(p => `<span class="pz-chip ${p.online ? "online" : "offline"}"><span class="pz-dot"></span>${escapeHtml(p.name)}</span>`).join("");
}

// ============================================================
//  CAPAS
// ============================================================
function addLayer() {
  const n = boardLayers.length + 1;
  boardLayers = boardLayers.concat([{ id: "L" + Date.now().toString(36), name: "Capa " + n }]);
  activeLayer = boardLayers[boardLayers.length - 1].id;
  SYNC.setLayers(boardLayers); renderLayers();
}
function moveLayer(from, to) {
  if (to < 0 || to >= boardLayers.length || from === to) return;
  const arr = boardLayers.slice(); const [it] = arr.splice(from, 1); arr.splice(to, 0, it);
  boardLayers = arr; SYNC.setLayers(boardLayers); render(); renderLayers();
}
let _dragLayer = null;
function renderLayers() {
  const box = document.getElementById("pzLayers");
  if (!box || !IS_ADMIN) return;
  box.innerHTML = "";
  // arriba en la lista = encima en el lienzo (orden inverso al array)
  const order = boardLayers.map((l, i) => i).reverse();
  order.forEach(idx => {
    const L = boardLayers[idx];
    const count = elements.filter(e => (e.layer || "L1") === L.id).length;
    const row = document.createElement("div");
    row.className = "pz-layer" + (activeLayer === L.id ? " sel" : "");
    row.draggable = true;
    row.innerHTML = `<span class="lh">⠿</span><span class="lname">${escapeHtml(L.name)}</span><span class="lc">${count}</span>`;
    row.addEventListener("click", () => { activeLayer = L.id; renderLayers(); });
    row.addEventListener("dragstart", () => _dragLayer = idx);
    row.addEventListener("dragover", e => e.preventDefault());
    row.addEventListener("drop", e => { e.preventDefault(); if (_dragLayer != null) moveLayer(_dragLayer, idx); _dragLayer = null; });
    box.appendChild(row);
  });
  const add = document.createElement("button"); add.className = "pz-addlayer"; add.textContent = "＋ Nueva capa";
  add.onclick = addLayer; box.appendChild(add);
}

let boardLayers = [{ id: "L1", name: "Capa 1" }];
let activeLayer = "L1";
function layerRank(id) { const i = boardLayers.findIndex(l => l.id === id); return i < 0 ? 0 : i; }
let presenceData = {};
const remoteCursors = {};
function drawCursors() {
  const ahora = Date.now();
  Object.entries(remoteCursors).forEach(([k, c]) => {
    if (k === MY_KEY || !c) return;
    const age = ahora - (c.t || 0);
    if (age > 8000) return;
    ctx.save();
    if (c.laser && age < 1500) {
      ctx.globalAlpha = clamp(1 - age / 1500, 0, 1);
      ctx.fillStyle = "#ff2d2d";
      ctx.beginPath(); ctx.arc(c.x, c.y, 9 / scale, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(c.x, c.y, 18 / scale, 0, Math.PI * 2); ctx.fill();
    } else if (!c.laser) {
      const s = 1 / scale;
      ctx.fillStyle = c.color || "#7c5cff";
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + 12 * s, c.y + 4 * s); ctx.lineTo(c.x + 5 * s, c.y + 6 * s); ctx.lineTo(c.x + 4 * s, c.y + 13 * s); ctx.closePath(); ctx.fill();
      ctx.font = `800 ${11 * s}px Nunito, sans-serif`; ctx.textBaseline = "top";
      const tw = ctx.measureText(c.name).width;
      ctx.fillStyle = c.color || "#7c5cff"; ctx.fillRect(c.x + 12 * s, c.y + 10 * s, tw + 10 * s, 16 * s);
      ctx.fillStyle = "#fff"; ctx.fillText(c.name, c.x + 17 * s, c.y + 12 * s);
    }
    ctx.restore();
  });
}
let lastCursor = 0;
function sendCursor(x, y, laser) {
  const now = Date.now();
  if (!laser && now - lastCursor < 55) return;
  lastCursor = now;
  SYNC.setCursor({ name: MY_NAME, color: MY_COLOR, x, y, laser: !!laser, t: now });
}

// ============================================================
//  SINCRONIZACIÓN (Firebase)
// ============================================================
const SYNC = (function () {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAWFb0vzkwWLiFS7a1RGN37cNJIlSpR6V4",
    authDomain: "pizarra-luana.firebaseapp.com",
    databaseURL: "https://pizarra-luana-default-rtdb.firebaseio.com",
    projectId: "pizarra-luana",
    storageBucket: "pizarra-luana.firebasestorage.app",
    messagingSenderId: "860985724021",
    appId: "1:860985724021:web:d20e5f47e95ba27b037c3c"
  };
  const ROOM = "luanna-pizarra";
  let elRef = null, bgRef = null, permRef = null, curRef = null, layersRef = null, ok = false;

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.database();
    const base = "rooms/" + ROOM + "/";
    elRef = db.ref(base + "elements");
    bgRef = db.ref(base + "bg");
    permRef = db.ref(base + "permissions");
    curRef = db.ref(base + "cursors");
    const presRef = db.ref(base + "presence");
    const meRef = db.ref(base + "presence/" + MY_KEY);
    const myCurRef = db.ref(base + "cursors/" + MY_KEY);

    // Estado completo: child_added trae TODO lo existente al entrar
    elRef.on("child_added", s => upsertRemote(s.val()));
    elRef.on("child_changed", s => upsertRemote(s.val()));
    elRef.on("child_removed", s => { const el = s.val(); if (el) { elements = elements.filter(e => e.id !== el.id); selectedIds.delete(el.id); render(); renderLayers(); } });

    layersRef = db.ref(base + "layers");
    layersRef.on("value", s => { const v = s.val(); if (v && v.length) { boardLayers = v; if (!boardLayers.find(l => l.id === activeLayer)) activeLayer = boardLayers[boardLayers.length - 1].id; render(); renderLayers(); } });
    bgRef.on("value", s => { const v = s.val(); if (v) { bgType = v; document.getElementById("pzBg").value = v; render(); } });
    permRef.on("value", s => applyPerms(s.val() || {}));
    curRef.on("value", s => { const d = s.val() || {}; Object.keys(remoteCursors).forEach(k => delete remoteCursors[k]); Object.assign(remoteCursors, d); render(); });

    firebase.database().ref(".info/connected").on("value", s => {
      if (s.val() !== true) return;
      const register = () => {
        // Los invitados liberan su lugar al salir (removidos); Papá/Luanna quedan "offline".
        if (IS_GUEST) meRef.onDisconnect().remove();
        else meRef.onDisconnect().update({ online: false, t: Date.now() });
        meRef.set({ name: MY_NAME, online: true, role: SESSION.role, t: Date.now() });
        myCurRef.onDisconnect().remove();
      };
      if (IS_GUEST) {
        // Aforo (máx 10) + nombre único entre conectados
        presRef.once("value").then(snap => {
          const d = snap.val() || {};
          const nm = (MY_NAME || "").trim().toLowerCase();
          const otros = Object.entries(d).filter(([k, v]) => k.startsWith("guest-") && k !== MY_KEY && v && v.online).length;
          const nameTaken = Object.entries(d).some(([k, v]) => k !== MY_KEY && v && v.online && (v.name || "").trim().toLowerCase() === nm);
          if (nameTaken) {
            alert('El nombre "' + MY_NAME + '" ya está en uso. Elige otro 🙂');
            window.location.href = "index.html";
          } else if (otros >= MAX_GUESTS) {
            alert("La pizarra ya tiene " + MAX_GUESTS + " invitados conectados. Intenta más tarde 🙂");
            window.location.href = "dashboard.html";
          } else register();
        });
      } else register();
    });
    presRef.on("value", s => { presenceData = s.val() || {}; renderPresence(presenceData); if (typeof onPresence === "function") onPresence(); });
    ok = true;
  } catch (e) { console.warn("Firebase no disponible:", e); }

  function upsertRemote(el) {
    if (!el || !el.id) return;
    if (el.z && el.z > zCounter) zCounter = el.z;
    const idx = elements.findIndex(e => e.id === el.id);
    if (idx >= 0) { const keep = elements[idx]._img; elements[idx] = el; if (keep) elements[idx]._img = keep; }
    else elements.push(el);
    if (el.type === "image" && !imgCache[el.id]) loadImg(el); else render();
    renderLayers();
  }

  return {
    ok,
    setElement: (el) => { if (elRef) elRef.child(el.id).set(el); },
    removeElement: (id) => { if (elRef) elRef.child(id).remove(); },
    clearAll: () => { if (elRef) elRef.remove(); },
    setBg: (v) => { if (bgRef) bgRef.set(v); },
    setLayers: (a) => { if (layersRef) layersRef.set(a); },
    setPermissions: (p) => { if (permRef) permRef.set(p); },
    setCursor: (c) => { if (curRef) curRef.child(MY_KEY).set(c); }
  };
})();

// ============================================================
//  MODO JUEGO · ADIVINA EL DIBUJO
// ============================================================
const GAME = (function () {
  const ROOM = "luanna-pizarra";
  let WORDS = [
    "gato", "perro", "elefante", "casa", "sol", "luna", "arbol", "flor", "pez", "pajaro",
    "manzana", "platano", "auto", "avion", "barco", "tren", "pelota", "globo", "helado", "pastel",
    "estrella", "corazon", "mariposa", "tortuga", "leon", "jirafa", "oso", "raton", "abeja", "araña",
    "zapato", "sombrero", "reloj", "lapiz", "libro", "silla", "mesa", "cama", "puerta", "ventana",
    "montaña", "rio", "nube", "lluvia", "fuego", "robot", "dinosaurio", "unicornio", "fantasma", "corona",
    "pizza", "queso", "huevo", "zanahoria", "uva", "fresa", "sandia", "galleta", "caramelo", "pinguino"
  ];
  // Carga libreria_play.txt: 1 palabra por línea; ignora encabezados (=== · [CAT] · ---- · vacías)
  (function loadLibrary() {
    fetch("libreria_play.txt?t=" + Date.now()).then(r => r.ok ? r.text() : null).then(txt => {
      if (!txt) return;
      const seen = {}, out = [];
      txt.split(/\r?\n/).forEach(line => {
        const w = line.trim();
        if (!w) return;
        if (/^[=\-\s]*$/.test(w)) return;          // separadores === o ----
        if (/^\[.*\]$/.test(w)) return;            // [CATEGORÍA]
        const key = w.toLowerCase();
        if (seen[key]) return; seen[key] = 1; out.push(w);
      });
      if (out.length >= 10) { WORDS = out; lastWords = []; console.log("libreria_play: " + out.length + " palabras"); }
    }).catch(() => { });
  })();
  let lastWords = [];
  function pickThree() {
    const out = []; let t = 0;
    while (out.length < 3 && t < 80) { const w = WORDS[Math.floor(Math.random() * WORDS.length)]; if (!out.includes(w) && !lastWords.includes(w)) out.push(w); t++; }
    while (out.length < 3) { const w = WORDS[Math.floor(Math.random() * WORDS.length)]; if (!out.includes(w)) out.push(w); }
    lastWords.push(...out); while (lastWords.length > 18) lastWords.shift();
    return out;
  }
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, ""); }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  let gameRef = null, state = null, gameOpen = false, muted = false, audioCtx = null, closedByUser = false;
  if (typeof firebase !== "undefined" && SYNC.ok) {
    try { gameRef = firebase.database().ref("rooms/" + ROOM + "/game"); gameRef.on("value", s => { state = s.val(); onState(); }); } catch (e) { console.warn("Juego sin Firebase:", e); }
  }

  // ---- Helpers de jugadores ----
  function onlineKeys() { return Object.keys(presenceData).filter(k => presenceData[k] && presenceData[k].online); }
  function isOnline(k) { return !!(presenceData[k] && presenceData[k].online); }
  function nameOf(k) { return (state && state.names && state.names[k]) || (presenceData[k] && presenceData[k].name) || "Jugador"; }
  function actingHost(g) { if (g && g.host && isOnline(g.host)) return g.host; return onlineKeys().sort()[0]; }
  function iAmHost(g) { return actingHost(g) === MY_KEY; }
  function remaining(g) { if (!g.startTs) return g.turnSeconds; const el = (Date.now() - g.startTs) / 1000; return el < 0 ? g.turnSeconds : Math.max(0, Math.round(g.turnSeconds - el)); }

  // ---- Sonido tic ----
  function tick() {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.04);
    } catch (e) {}
  }
  function celebrate() {
    const box = document.getElementById("pzConfetti"); if (!box) return;
    const cols = ["#ff4f9a", "#7c5cff", "#2eb872", "#ffc83d", "#ff7a3d", "#4d9fff"];
    box.innerHTML = ""; box.classList.add("show");
    for (let i = 0; i < 80; i++) { const c = document.createElement("i"); c.style.left = Math.random() * 100 + "%"; c.style.background = cols[i % cols.length]; c.style.animationDuration = (1.5 + Math.random() * 1.5) + "s"; c.style.animationDelay = (Math.random() * .3) + "s"; box.appendChild(c); }
    setTimeout(() => box.classList.remove("show"), 2800);
  }
  // Estrella grande de acierto (solo la ve quien adivinó, ~2s, no bloquea)
  function showStar(word, pts) {
    let el = document.getElementById("pzStar");
    if (!el) { el = document.createElement("div"); el.id = "pzStar"; el.className = "pz-star"; document.getElementById("pzStage").appendChild(el); }
    el.innerHTML = `<div class="pz-star-shape"><div class="pz-star-w">${escapeHtml((word || "").toUpperCase())}</div><div class="pz-star-sub">¡Adivinaste!</div><div class="pz-star-pts">+${pts}</div><div class="pz-star-pt2">puntos</div></div>`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2000);
    celebrate();
  }

  const TURN_SECS = 99, LEAD_MS = 3000;
  // ---- Reparto de puntos (estrellas) ----
  function guesserStars(order) { return [60, 50, 40, 30, 20, 10][Math.min(order - 1, 5)]; }
  function drawerStars(frac) { return Math.round(frac * 4) / 4 * 100; }   // 0/25/50/75/100 según %
  function nonDrawers(g) { return (g.queue || []).filter(k => k !== g.drawer && isOnline(k)); }
  function allGuessed(g) { const nd = nonDrawers(g); return nd.length > 0 && nd.every(k => g.guessed && g.guessed[k]); }
  function countdownLeft(g) { return g.startTs ? Math.ceil((g.startTs - Date.now()) / 1000) : 0; } // >0 = cuenta 3-2-1

  // ---- Transiciones ----
  function startGame() {
    if (!IS_ADMIN) return;                                   // M14: solo Papá inicia
    const players = shuffle(onlineKeys());
    if (players.length < 2) { alert("Se necesitan al menos 2 jugadores conectados 🙂"); return; }
    const names = {}, scores = {}; players.forEach(k => { names[k] = nameOf(k); scores[k] = 0; });
    SYNC.clearAll();
    gameRef.set({ status: "choosing", host: MY_KEY, turnSeconds: TURN_SECS, queue: players, round: 1, drawer: players[0], choices: pickThree(), word: null, startTs: null, guessed: null, scores, names, roundResult: null, chat: null });
  }
  function chooseWord(w) {
    // startTs adelantado: 3s de cuenta regresiva antes de habilitar el dibujo
    gameRef.update({ status: "playing", word: w, choices: null, startTs: Date.now() + LEAD_MS, guessed: null });
    gameRef.child("chat").remove();
  }
  function nextTurn(g) {
    let idx = g.queue.indexOf(g.drawer), next = null;
    for (let i = 1; i <= g.queue.length; i++) { const cand = g.queue[(idx + i) % g.queue.length]; if (isOnline(cand)) { next = cand; break; } }
    if (!next) next = onlineKeys()[0];
    if (!next) { gameRef.remove(); return; }
    // M3: jugadores que entraron durante la partida se suman a la cola y al marcador
    const queue = g.queue.slice(), names = Object.assign({}, g.names || {}), scores = Object.assign({}, g.scores || {});
    onlineKeys().forEach(k => { if (!queue.includes(k)) { queue.push(k); names[k] = nameOf(k); if (scores[k] == null) scores[k] = 0; } });
    SYNC.clearAll();
    gameRef.update({ status: "choosing", round: (g.round || 1) + 1, drawer: next, queue, names, scores, choices: pickThree(), word: null, startTs: null, guessed: null, roundResult: null });
    gameRef.child("chat").remove();
  }
  function endRound(g) {
    const nd = nonDrawers(g), got = nd.filter(k => g.guessed && g.guessed[k]).length;
    const frac = nd.length ? got / nd.length : 0;
    const elapsed = g.startTs ? (Date.now() - g.startTs) / 1000 : g.turnSeconds;
    const bonus = (got === nd.length && nd.length > 0 && elapsed < g.turnSeconds / 2) ? 20 : 0;
    const dpts = drawerStars(frac) + bonus;
    const scores = Object.assign({}, g.scores || {});
    scores[g.drawer] = (scores[g.drawer] || 0) + dpts;
    gameRef.update({ status: "roundEnd", roundEndTs: Date.now(), scores, roundResult: { word: g.word, drawerName: nameOf(g.drawer), got, total: nd.length, dpts, bonus } });
  }

  // ---- Adivinanzas (chat) ----
  function sendGuess(text) {
    const g = state; if (!g || !text.trim() || g.status !== "playing") return;
    if (MY_KEY === g.drawer) return;                 // dibujante no responde
    if (g.guessed && g.guessed[MY_KEY]) return;       // ya acertó → bloqueado
    if (norm(text) === norm(g.word)) {
      // Acierto: NO se publica el mensaje; aviso sin revelar palabra; bloquea al jugador
      const order = Object.keys(g.guessed || {}).length + 1, pts = guesserStars(order);
      const scores = Object.assign({}, g.scores || {}); scores[MY_KEY] = (scores[MY_KEY] || 0) + pts;
      const guessed = Object.assign({}, g.guessed || {}); guessed[MY_KEY] = order;
      gameRef.child("chat").push({ system: true, text: "🎉 " + MY_NAME + " adivinó la palabra (+" + pts + ")", t: Date.now() });
      gameRef.update({ scores, guessed });
      showStar(g.word, pts);                              // estrella grande, solo la ve quien acertó
      if (allGuessed(Object.assign({}, g, { guessed }))) endRound(Object.assign({}, g, { guessed }));
    } else {
      gameRef.child("chat").push({ key: MY_KEY, name: MY_NAME, text, t: Date.now() });
    }
  }

  // ---- Reacción a cada cambio de estado ----
  let lastStatus = null;
  function onState() {
    const g = state;
    if (g && g.status !== "config" && !gameOpen && !closedByUser) gameOpen = true;
    if (g && g.status === "roundEnd" && lastStatus !== "roundEnd") celebrate();
    lastStatus = g ? g.status : null;
    document.getElementById("pzPlayBtn").classList.toggle("on", !!(g && g.status !== "config"));
    const sr = document.getElementById("pzStarsRow"); if (sr && (!g || g.status !== "playing")) sr.classList.remove("show");
    if (typeof GAME_endBtn !== "undefined" && GAME_endBtn) GAME_endBtn.style.display = (g && g.status !== "config") ? "" : "none";
    renderGame();
  }
  function gamePresence() {
    const g = state; if (!g) return;
    // M14: si quedan menos de 2 jugadores, cancela y vuelve a espera
    if (iAmHost(g) && onlineKeys().length < 2) { gameRef.remove(); return; }
    // Dibujante desconectado → el anfitrión salta al siguiente
    if ((g.status === "playing" || g.status === "choosing") && iAmHost(g) && !isOnline(g.drawer)) nextTurn(g);
    if (gameOpen) renderGame();
  }

  // ---- Bucle de tiempo (1s) ----
  let lastCd = 0;
  setInterval(() => {
    const g = state; if (!g) return;
    if (g.status === "playing") {
      const cd = countdownLeft(g);
      const tEl = document.getElementById("pzgTime");
      if (cd > 0) {                               // cuenta 3-2-1 antes de dibujar
        if (tEl) tEl.textContent = "¡" + cd + "!";
        if (gameOpen && cd !== lastCd) { tick(); lastCd = cd; }
        return;
      }
      const rem = remaining(g);
      if (tEl) { tEl.textContent = fmt(rem); const bar = document.getElementById("pzgBar"); if (bar) bar.style.width = (rem / g.turnSeconds * 100) + "%"; }
      // #5 refrescar letras reveladas (solo a quien no es dibujante ni adivinó)
      const wm = document.getElementById("pzgWordMask");
      if (wm && g.drawer !== MY_KEY && !(g.guessed && g.guessed[MY_KEY])) wm.innerHTML = maskWord(g);
      starsRow(g);                                // #4 fila de estrellas
      if (gameOpen && rem > 0) tick();
      if (iAmHost(g) && (rem <= 0 || allGuessed(g))) endRound(g);
    } else if (g.status === "roundEnd" && iAmHost(g)) {
      if (Date.now() - (g.roundEndTs || 0) > 3000) nextTurn(g);   // ranking ~3s
    }
  }, 1000);
  // #4 — fila de estrellas bajo la pizarra: 1 estrella por jugador, encendida si adivinó
  function starsRow(g) {
    const row = document.getElementById("pzStarsRow"); if (!row) return;
    if (!g || g.status !== "playing") { row.classList.remove("show"); return; }
    const nd = nonDrawers(g);
    row.innerHTML = nd.map(k => `<span class="${g.guessed && g.guessed[k] ? "on" : ""}">★</span>`).join("");
    row.classList.toggle("show", nd.length > 0);
  }
  function fmt(s) { const m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; }

  // ---- Render del panel ----
  // Máscara con revelación gradual de letras según el tiempo transcurrido (#5)
  function maskWord(g) {
    const w = (g && g.word) || "", letters = [...w];
    const idxs = letters.map((c, i) => (c === " " ? -1 : i)).filter(i => i >= 0);
    const total = idxs.length;
    let k = 0;
    if (g && g.startTs && total > 1) {
      const prog = clamp((Date.now() - g.startTs) / 1000 / g.turnSeconds, 0, 1);
      k = Math.min(total - 1, Math.floor(prog * total));  // nunca todas
    }
    // orden determinista (mismo para todos los clientes)
    const order = idxs.slice().sort((a, b) => ((a * 7 + (w.charCodeAt(a) || 0)) % 101) - ((b * 7 + (w.charCodeAt(b) || 0)) % 101));
    const show = new Set(order.slice(0, Math.max(0, k)));
    return letters.map((c, i) => c === " " ? "&nbsp;&nbsp;" : (show.has(i) ? c.toUpperCase() : "_")).join(" ");
  }
  function renderGame() {
    const panel = document.getElementById("pzGamePanel"), body = document.getElementById("pzGameBody");
    panel.classList.toggle("open", gameOpen);
    if (!gameOpen) return;
    const g = state;
    const online = onlineKeys().length;
    const head = `<div class="pzg-head">🎮 Adivina el Dibujo <span style="font-size:.72rem;font-weight:700;opacity:.9">· ${online} en línea</span><button class="x" id="pzgClose">✕</button></div>`;
    if (!gameRef) { body.innerHTML = head + `<div class="pzg-sec">El juego necesita conexión en línea.</div>`; wireClose(); return; }

    // --- Configuración (sin partida) ---
    if (!g || g.status === "config") {
      const players = onlineKeys().map(k => `<span class="pzg-pchip">${escapeHtml(nameOf(k))}</span>`).join("") || `<span class="pzg-pchip">Esperando jugadores…</span>`;
      const ctrl = IS_ADMIN
        ? `<button class="pzg-btn" id="pzgStart">▶ Iniciar partida</button>
           <p style="font-size:.76rem;color:var(--text-soft);margin-top:8px">Turno 99s · rondas ilimitadas · rotan turnos. Mínimo 2 jugadores. Termina con ⏹.</p>`
        : `<p style="font-size:.9rem;font-weight:800;color:var(--purple-dark);text-align:center;padding:6px 0">⏳ Esperando que Papá inicie la partida…</p>`;
      body.innerHTML = head + `
        <div class="pzg-sec">${ctrl}</div>
        <div class="pzg-sec"><div class="pzg-title">Jugadores conectados (${online})</div><div class="pzg-players">${players}</div></div>`;
      wireClose();
      const sb = body.querySelector("#pzgStart"); if (sb) sb.onclick = () => startGame();
      return;
    }

    const meDrawer = g.drawer === MY_KEY;
    const rank = Object.keys(g.scores || {}).sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));
    const stopBtn = iAmHost(g) ? `<button class="pzg-stop" id="pzgStop" title="Terminar juego">⏹</button>` : "";
    const metaSec = `<div class="pzg-sec"><div class="pzg-meta"><span>✏️ Dibuja: <b>${escapeHtml(nameOf(g.drawer))}</b></span><span>Ronda <b>${g.round}</b> ${stopBtn}</span></div></div>`;

    // --- Elegir palabra ---
    if (g.status === "choosing") {
      let mid;
      if (meDrawer) {
        mid = `<div class="pzg-sec"><div class="pzg-title">Elige una palabra para dibujar</div>
          <div class="pzg-choices">${(g.choices || []).map(w => `<button class="pzg-choice" data-w="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}</div></div>`;
      } else {
        mid = `<div class="pzg-sec" style="text-align:center"><div class="pzg-word"><small>⏳ ${escapeHtml(nameOf(g.drawer))} está eligiendo palabra…</small></div></div>`;
      }
      body.innerHTML = head + metaSec + mid + `<div class="pzg-sec"><div class="pzg-title">⭐ Puntuación</div>${scoreRows(g, rank)}</div>`;
      wireClose(); wireStop();
      if (meDrawer) body.querySelectorAll(".pzg-choice").forEach(b => b.onclick = () => chooseWord(b.dataset.w));
      return;
    }

    // --- Jugando / fin de ronda ---
    const guessedMe = !!(g.guessed && g.guessed[MY_KEY]);
    const wordHtml = meDrawer
      ? `<div class="pzg-word">${escapeHtml(g.word)}<small>¡Te toca dibujar! No escribas la palabra</small></div>`
      : `<div class="pzg-word"><span id="pzgWordMask">${maskWord(g)}</span><small>${(g.word || "").replace(/ /g, "").length} letras</small></div>`;
    const reveal = g.status === "roundEnd"
      ? `<div class="pzg-reveal"><div class="pzg-reveal-star">⭐</div><div class="pzg-reveal-word">${escapeHtml((g.roundResult && g.roundResult.word) || g.word)}</div>
         <div class="pzg-reveal-sub">${g.roundResult ? g.roundResult.got + " de " + g.roundResult.total + " adivinaron · ✏️ +" + (g.roundResult.dpts || 0) + (g.roundResult.bonus ? " (bono +20)" : "") : ""}</div></div>` : "";
    const chatMsgs = g.chat ? Object.values(g.chat).sort((a, b) => a.t - b.t).slice(-40) : [];
    const chatHtml = chatMsgs.map(m => m.system
      ? `<div class="pzg-msg correct">${escapeHtml(m.text)}</div>`
      : `<div class="pzg-msg"><span class="who" style="color:${m.key === g.drawer ? "#999" : "var(--purple)"}">${escapeHtml(m.name)}:</span> ${escapeHtml(m.text)}</div>`).join("");
    const canGuess = g.status === "playing" && !meDrawer && !guessedMe;

    body.innerHTML = head + metaSec + `
      <div class="pzg-sec pzg-timer">
        <div class="pzg-title" style="display:flex;justify-content:center;gap:8px;align-items:center">Tiempo restante <button class="pzg-mute" id="pzgMute" title="Silenciar">${muted ? "🔇" : "🔊"}</button></div>
        <div class="pzg-time" id="pzgTime">${fmt(remaining(g))}</div>
        <div class="pzg-bar"><div id="pzgBar" style="width:${remaining(g) / g.turnSeconds * 100}%"></div></div>
        ${reveal || wordHtml}
      </div>
      <div class="pzg-sec grow">
        <div class="pzg-title">Chat — escribe tu respuesta</div>
        <div class="pzg-chat" id="pzgChat">${chatHtml}</div>
        <div class="pzg-chatform">
          <input id="pzgInput" placeholder="${meDrawer ? "Tú dibujas 🎨" : (guessedMe ? "¡Ya adivinaste! 🌟" : (canGuess ? "Escribe tu respuesta…" : "Espera…"))}" ${canGuess ? "" : "disabled"}>
          <button id="pzgSend" ${canGuess ? "" : "disabled"}>➤</button>
        </div>
      </div>
      <div class="pzg-sec"><div class="pzg-title">⭐ Puntuación</div>${scoreRows(g, rank)}</div>`;
    wireClose(); wireStop();
    const chatBox = document.getElementById("pzgChat"); if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    const mb = document.getElementById("pzgMute"); if (mb) mb.onclick = () => { muted = !muted; renderGame(); };
    const inp = document.getElementById("pzgInput"), snd = document.getElementById("pzgSend");
    if (snd && !snd.disabled) {
      const go = () => { if (inp.value.trim()) { sendGuess(inp.value); inp.value = ""; inp.focus(); } };
      snd.onclick = go;
      inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    }
  }
  function wireStop() { const s = document.getElementById("pzgStop"); if (s) s.onclick = () => { if (confirm("¿Terminar el juego para todos?")) gameRef.remove(); }; }
  function scoreRows(g, rank) {
    const medals = ["🥇", "🥈", "🥉"];
    return rank.map((k, i) => `<div class="pzg-score${k === MY_KEY ? " me" : ""}"><span class="medal">${medals[i] || ""}</span><span class="nm">${escapeHtml(nameOf(k))}${k === g.drawer ? " ✏️" : ""}</span><span class="st">⭐ ${g.scores[k] || 0}</span></div>`).join("");
  }
  function wireClose() { const c = document.getElementById("pzgClose"); if (c) c.onclick = () => { gameOpen = false; closedByUser = true; renderGame(); document.getElementById("pzPlayBtn").classList.remove("on"); }; }

  // Botón JUGAR
  document.getElementById("pzPlayBtn").addEventListener("click", () => {
    gameOpen = !gameOpen; closedByUser = !gameOpen;
    if (gameOpen) { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    renderGame();
  });

  return {
    presence: gamePresence,
    endGame: () => { if (gameRef) gameRef.remove(); },
    blockPointer(t) { const g = state; if (!g || (g.status !== "playing" && g.status !== "choosing")) return false; if (g.status === "choosing" || g.drawer !== MY_KEY) return !(t === "pan" || t === "laser"); if (countdownLeft(g) > 0) return !(t === "pan" || t === "laser"); return t === "text" || t === "sticker"; },
    blockTool(kind) { const g = state; if (!g || (g.status !== "playing" && g.status !== "choosing")) return false; if (g.status === "choosing" || g.drawer !== MY_KEY) return true; return ["text", "sticker", "image"].includes(kind); }
  };
})();
// Hook llamado desde la capa de sincronización cuando cambia la presencia
function onPresence() { if (typeof GAME !== "undefined" && GAME.presence) GAME.presence(); }

// ---------- Arranque ----------
updateUndoRedo();
resizeCanvas();

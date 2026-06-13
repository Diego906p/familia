// ===== Pizarra colaborativa =====
// Estado completo sincronizado en Firebase: quien entra ve todo lo ya dibujado.
// Sin persistencia histórica: el contenido solo se borra con "Limpiar todo".

requireAuth(["child", "admin"]);
const SESSION = getSession() || { role: "child", username: "luanna" };
const IS_ADMIN = SESSION.role === "admin";
const MY_NAME = IS_ADMIN ? "Papá" : (SESSION.username === "luanna" ? "Luanna" : SESSION.username);
const MY_COLOR = IS_ADMIN ? "#4d9fff" : "#ff4f9a";
const MY_KEY = SESSION.role + "-" + (SESSION.username || "x");

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
let color = "#3c3160";
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
  const ordered = [...elements].sort((a, b) => (a.z || 0) - (b.z || 0));
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
  ctx.save();
  ctx.strokeStyle = el.color || color;
  ctx.fillStyle = el.color || color;
  ctx.lineWidth = el.width || 2;
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  if (el.type === "path" || el.type === "highlighter") {
    if (el.type === "highlighter") { ctx.globalAlpha = 0.35; ctx.lineWidth = (el.width || 2) * 3; }
    ctx.beginPath();
    el.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  } else if (el.type === "line") {
    ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke();
  } else if (el.type === "arrow") {
    drawArrow(el.x1, el.y1, el.x2, el.y2, el.width || 2);
  } else if (el.type === "rect") {
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  } else if (el.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === "text") {
    ctx.font = `700 ${el.size || 22}px Nunito, sans-serif`; ctx.textBaseline = "top";
    el.text.split("\n").forEach((ln, i) => ctx.fillText(ln, el.x, el.y + i * (el.size || 22) * 1.2));
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

function bounds(el) {
  if (el.type === "rect" || el.type === "circle" || el.type === "image")
    return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
  if (el.type === "line" || el.type === "arrow")
    return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
  if (el.type === "text") {
    ctx.font = `700 ${el.size || 22}px Nunito, sans-serif`;
    const lines = el.text.split("\n"), w = Math.max(...lines.map(l => ctx.measureText(l).width));
    return { x: el.x, y: el.y, w, h: lines.length * (el.size || 22) * 1.2 };
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
  if (single && single.type === "image" && !single.locked) {
    const b = bounds(single); ctx.setLineDash([]); ctx.fillStyle = "#7c5cff";
    ctx.fillRect(b.x + b.w - 6, b.y + b.h - 6, 14 / scale + 6, 14 / scale + 6);
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
  if (el.type !== "image" || el.locked) return false;
  const b = bounds(el);
  return p.x >= b.x + b.w - 10 && p.x <= b.x + b.w + 14 && p.y >= b.y + b.h - 10 && p.y <= b.y + b.h + 14;
}
function hitElement(el, p) {
  const b = bounds(el), pad = (el.width || 6) + 6;
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
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

  if (tool === "pan") { dragMode = "pan"; dragStart = { sx: sp.x, sy: sp.y, tx, ty }; return; }
  if (tool === "laser") { sendCursor(p.x, p.y, true); return; }

  if (tool === "select") {
    const single = selectedIds.size === 1 && elements.find(el => selectedIds.has(el.id));
    if (single && hitResizeHandle(single, p)) {
      dragMode = "resize"; dragStart = { x: p.x, y: p.y, w: single.w, h: single.h, ratio: single.w / single.h };
      return;
    }
    const hit = topElementAt(p, true);
    if (hit) {
      if (!selectedIds.has(hit.id)) { if (!e.shiftKey) selectedIds.clear(); selectedIds.add(hit.id); }
      // mover (solo elementos no bloqueados)
      const movable = [...selectedIds].map(id => elements.find(el => el.id === id)).filter(el => el && !el.locked);
      dragMode = "move";
      dragStart = { x: p.x, y: p.y, snaps: movable.map(el => ({ id: el.id, geo: geom(el) })) };
    } else {
      selectedIds.clear();
      dragMode = "marquee"; dragStart = { x: p.x, y: p.y };
      marquee = { x: p.x, y: p.y, w: 0, h: 0 };
    }
    render();
    return;
  }

  if (tool === "eraser") { eraseAt(p); return; }
  if (tool === "text") { openTextInput(p); return; }
  if (tool === "sticker") { placeSticker(p); return; }

  const id = CLIENT_ID + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  if (tool === "pencil" || tool === "highlighter")
    drawing = { id, type: tool === "highlighter" ? "highlighter" : "path", color, width: lineWidth, points: [p], z: ++zCounter };
  else if (tool === "line" || tool === "arrow")
    drawing = { id, type: tool, color, width: lineWidth, x1: p.x, y1: p.y, x2: p.x, y2: p.y, z: ++zCounter };
  else if (tool === "rect" || tool === "circle")
    drawing = { id, type: tool, color, width: lineWidth, x: p.x, y: p.y, w: 0, h: 0, z: ++zCounter };
  render();
}

function move(e) {
  const p = pos(e), sp = screenPos(e);
  if (tool !== "laser") sendCursor(p.x, p.y, false);

  if (dragMode === "pan") { tx = dragStart.tx + (sp.x - dragStart.sx); ty = dragStart.ty + (sp.y - dragStart.sy); clampView(); render(); return; }
  if (tool === "laser" && (e.buttons || e.touches)) { sendCursor(p.x, p.y, true); return; }

  if (tool === "select" && dragMode) {
    if (dragMode === "marquee") { marquee = { x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) }; render(); return; }
    if (dragMode === "move") {
      const dx = p.x - dragStart.x, dy = p.y - dragStart.y;
      dragStart.snaps.forEach(s => { const el = elements.find(x => x.id === s.id); if (el) applyGeom(el, s.geo, dx, dy); });
      render(); return;
    }
    if (dragMode === "resize") {
      const el = elements.find(x => selectedIds.has(x.id));
      if (el) { el.w = Math.max(20, dragStart.w + (p.x - dragStart.x) * Math.sign(el.w || 1)); el.h = (lockRatio && dragStart.ratio) ? Math.max(20, el.w / dragStart.ratio) : Math.max(20, dragStart.h + (p.y - dragStart.y) * Math.sign(el.h || 1)); render(); }
      return;
    }
  }

  if (tool === "eraser" && (e.buttons || e.touches)) { eraseAt(p); return; }
  if (!drawing) return;
  if (drawing.points) drawing.points.push(p);
  else if (drawing.type === "line" || drawing.type === "arrow") { drawing.x2 = p.x; drawing.y2 = p.y; }
  else { drawing.w = p.x - drawing.x; drawing.h = p.y - drawing.y; }
  render();
}

function up() {
  if (dragMode === "pan") { dragMode = null; return; }

  if (tool === "select" && dragMode) {
    if (dragMode === "marquee") {
      const m = marquee; marquee = null;
      if (m && (m.w > 5 || m.h > 5)) {
        selectedIds.clear();
        elements.forEach(el => { const b = bounds(el); if (b.x >= m.x - 2 && b.y >= m.y - 2 && b.x + b.w <= m.x + m.w + 2 && b.y + b.h <= m.y + m.h + 2) selectedIds.add(el.id); });
      }
      dragMode = null; render(); return;
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
        if (el) { const after = { w: el.w, h: el.h }; const bw = before[0]; history.push({ undo: () => { el.w = dragStart.w; el.h = dragStart.h; SYNC.setElement(serialize(el)); render(); }, redo: () => { el.w = after.w; el.h = after.h; SYNC.setElement(serialize(el)); render(); } }); }
      }
      dragMode = null; dragStart = null; return;
    }
    dragMode = null; return;
  }

  if (drawing) {
    const b = bounds(drawing);
    const tiny = (drawing.points && drawing.points.length < 2) || (!drawing.points && b.w < 3 && b.h < 3);
    if (!tiny) addElement(drawing, true);
    drawing = null; render();
  }
}

function geom(el) { return JSON.parse(JSON.stringify({ points: el.points, x: el.x, y: el.y, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, w: el.w, h: el.h })); }
function setGeom(el, g) { ["points", "x", "y", "x1", "y1", "x2", "y2", "w", "h"].forEach(k => { if (g[k] !== undefined) el[k] = JSON.parse(JSON.stringify(g[k])); }); }
function applyGeom(el, g, dx, dy) {
  if (g.points) el.points = g.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  else if (el.type === "line" || el.type === "arrow") { el.x1 = g.x1 + dx; el.y1 = g.y1 + dy; el.x2 = g.x2 + dx; el.y2 = g.y2 + dy; }
  else { el.x = g.x + dx; el.y = g.y + dy; }
}

function eraseAt(p) {
  const victims = elements.filter(el => !el.locked && hitElement(el, p));
  if (!victims.length) return;
  victims.forEach(el => removeElement(el.id, true));
  render();
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

// ============================================================
//  ALTA / BAJA DE ELEMENTOS  (con historial)
// ============================================================
function addElement(el, record) {
  elements.push(el);
  if (imgCache[el.id] && el.type === "image") { } // ya cacheada
  SYNC.setElement(serialize(el));
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
  render();
}

function serialize(el) { const c = { ...el }; delete c._img; return c; }

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
window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && document.activeElement !== textInput) { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
  if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size && document.activeElement !== textInput) {
    [...selectedIds].forEach(id => { const el = elements.find(e => e.id === id); if (el && !el.locked) removeElement(id, true); });
  }
});

// ============================================================
//  TEXTO
// ============================================================
let textPos = null;
function openTextInput(p) {
  textPos = p; const r = canvas.getBoundingClientRect();
  textInput.style.left = (r.left + p.x * scale + tx) + "px";
  textInput.style.top = (r.top + p.y * scale + ty) + "px";
  textInput.style.color = color; textInput.style.fontSize = Math.max(16, lineWidth * 4) + "px";
  textInput.style.display = "block"; textInput.value = ""; setTimeout(() => textInput.focus(), 0);
}
function commitText() {
  if (textInput.style.display === "none") return;
  const val = textInput.value.trim(); textInput.style.display = "none";
  if (val && textPos) addElement({ id: CLIENT_ID + "-" + Date.now().toString(36), type: "text", color, size: Math.max(16, lineWidth * 4), x: textPos.x, y: textPos.y, text: val, z: ++zCounter }, true);
  textPos = null;
}
textInput.addEventListener("blur", commitText);
textInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } });

// ============================================================
//  IMÁGENES
// ============================================================
document.getElementById("pzImage").addEventListener("change", e => {
  [...e.target.files].forEach(file => { const rd = new FileReader(); rd.onload = () => addImageFromSrc(rd.result); rd.readAsDataURL(file); });
  e.target.value = "";
});
function addImageFromSrc(src) {
  const img = new Image();
  img.onload = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const cx = (w / 2 - tx) / scale, cy = (h / 2 - ty) / scale;
    const sc = Math.min(1, (w * 0.5) / img.width, (h * 0.5) / img.height) / scale;
    const iw = img.width * sc, ih = img.height * sc;
    const el = { id: CLIENT_ID + "-img-" + Date.now().toString(36), type: "image", x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih, src, z: ++zCounter };
    imgCache[el.id] = img;
    addElement(el, true);
    render();
  };
  img.src = src;
}
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
  document.querySelectorAll(".pz-tool[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === t));
  if (t !== "select") selectedIds.clear();
  canvas.style.cursor = t === "pan" ? "grab" : (t === "select" ? "default" : "crosshair");
  render();
}
document.querySelectorAll(".pz-tool[data-tool]").forEach(btn => btn.addEventListener("click", () => setTool(btn.dataset.tool)));

const swatches = document.getElementById("pzSwatches");
["#3c3160", "#ff4f9a", "#7c5cff", "#2eb872", "#ffc83d", "#ff7a3d", "#4d9fff", "#ffffff"].forEach((c, i) => {
  const s = document.createElement("div"); s.className = "pz-swatch" + (i === 0 ? " active" : ""); s.style.background = c;
  s.addEventListener("click", () => { color = c; document.querySelectorAll(".pz-swatch").forEach(x => x.classList.remove("active")); s.classList.add("active"); });
  swatches.appendChild(s);
});
document.getElementById("pzSize").addEventListener("input", e => lineWidth = +e.target.value);
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
  const btn = document.getElementById("pzPerms"); btn.style.display = "";
  const body = document.getElementById("pzPermsBody"), panel = document.getElementById("pzPermsPanel");
  Object.keys(PERM_LABELS).forEach(k => {
    const row = document.createElement("label"); row.className = "pz-perm-row";
    row.innerHTML = `<span>${PERM_LABELS[k]}</span>`;
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = true; c.dataset.perm = k;
    c.addEventListener("change", () => { PERMS[k] = c.checked; SYNC.setPermissions(PERMS); });
    row.appendChild(c); body.appendChild(row);
  });
  btn.addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("pzPermsClose").addEventListener("click", () => panel.classList.remove("open"));
}

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
  let elRef = null, bgRef = null, permRef = null, curRef = null, ok = false;

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
    elRef.on("child_removed", s => { const el = s.val(); if (el) { elements = elements.filter(e => e.id !== el.id); selectedIds.delete(el.id); render(); } });

    bgRef.on("value", s => { const v = s.val(); if (v) { bgType = v; document.getElementById("pzBg").value = v; render(); } });
    permRef.on("value", s => applyPerms(s.val() || {}));
    curRef.on("value", s => { const d = s.val() || {}; Object.keys(remoteCursors).forEach(k => delete remoteCursors[k]); Object.assign(remoteCursors, d); render(); });

    firebase.database().ref(".info/connected").on("value", s => {
      if (s.val() === true) {
        meRef.onDisconnect().update({ online: false, t: Date.now() });
        meRef.set({ name: MY_NAME, online: true, t: Date.now() });
        myCurRef.onDisconnect().remove();
      }
    });
    presRef.on("value", s => renderPresence(s.val()));
    ok = true;
  } catch (e) { console.warn("Firebase no disponible:", e); }

  function upsertRemote(el) {
    if (!el || !el.id) return;
    if (el.z && el.z > zCounter) zCounter = el.z;
    const idx = elements.findIndex(e => e.id === el.id);
    if (idx >= 0) { const keep = elements[idx]._img; elements[idx] = el; if (keep) elements[idx]._img = keep; }
    else elements.push(el);
    if (el.type === "image" && !imgCache[el.id]) loadImg(el); else render();
  }

  return {
    ok,
    setElement: (el) => { if (elRef) elRef.child(el.id).set(el); },
    removeElement: (id) => { if (elRef) elRef.child(id).remove(); },
    clearAll: () => { if (elRef) elRef.remove(); },
    setBg: (v) => { if (bgRef) bgRef.set(v); },
    setPermissions: (p) => { if (permRef) permRef.set(p); },
    setCursor: (c) => { if (curRef) curRef.child(MY_KEY).set(c); }
  };
})();

// ---------- Arranque ----------
updateUndoRedo();
resizeCanvas();

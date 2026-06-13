// ===== Pizarra colaborativa =====
// Sin persistencia: cada vez que se entra, la pizarra arranca en blanco.
// Sincronización en tiempo real mediante una capa "SYNC" abstracta:
//   - BroadcastChannel: funciona entre pestañas/ventanas del MISMO dispositivo (activo por defecto).
//   - Firebase: para tiempo real ENTRE dispositivos (rellenar FIREBASE_CONFIG más abajo).

requireAuth(["child", "admin"]);

// Botón volver según el rol
document.getElementById("pzBack").addEventListener("click", () => {
  const s = getSession();
  window.location.href = s && s.role === "admin" ? "admin.html" : "dashboard.html";
});

// ---------- Estado ----------
const canvas = document.getElementById("pzCanvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("pzStage");
const textInput = document.getElementById("pzTextInput");

const CLIENT_ID = Math.random().toString(36).slice(2, 9);
let elements = [];            // [{id, type, ...}]
let tool = "select";
let color = "#3c3160";
let lineWidth = 4;

let drawing = null;           // elemento en construcción
let selectedId = null;        // elemento seleccionado (select tool)
let dragMode = null;          // "move" | "resize"
let dragStart = null;         // {x, y, ...orig}
let lockRatio = false;        // bloquear proporción al redimensionar imágenes

// Vista (zoom y desplazamiento). screen = world*scale + t
let scale = 1, tx = 0, ty = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COLORS = ["#3c3160", "#ff4f9a", "#7c5cff", "#2eb872", "#ffc83d", "#ff7a3d", "#4d9fff", "#ffffff"];

// ---------- Lienzo y resolución ----------
function resizeCanvas() {
  const r = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  render();
}
window.addEventListener("resize", resizeCanvas);

// Coordenadas de pantalla (CSS) relativas al lienzo
function screenPos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
// Coordenadas del "mundo" (compensando zoom y desplazamiento)
function pos(e) {
  const s = screenPos(e);
  return { x: (s.x - tx) / scale, y: (s.y - ty) / scale };
}

// ---------- Render ----------
function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  // Fondo blanco en espacio de pantalla (cubre todo, sin importar el zoom)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // Contenido en espacio del mundo (con zoom/desplazamiento)
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
  for (const el of elements) drawElement(el);
  if (drawing) drawElement(drawing);
  drawSelection();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Zoom centrado en un punto de pantalla (cx, cy en px CSS)
function zoomAt(cx, cy, factor) {
  const wx = (cx - tx) / scale, wy = (cy - ty) / scale;
  scale = clamp(scale * factor, 0.25, 6);
  tx = cx - wx * scale; ty = cy - wy * scale;
  render(); updateZoomLabel();
}
function zoomReset() { scale = 1; tx = 0; ty = 0; render(); updateZoomLabel(); }
function updateZoomLabel() {
  document.getElementById("pzZoomReset").textContent = Math.round(scale * 100) + "%";
}

function drawElement(el) {
  ctx.save();
  ctx.strokeStyle = el.color || color;
  ctx.fillStyle = el.color || color;
  ctx.lineWidth = el.width || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

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
    ctx.font = `700 ${el.size || 22}px Nunito, sans-serif`;
    ctx.textBaseline = "top";
    el.text.split("\n").forEach((ln, i) => ctx.fillText(ln, el.x, el.y + i * (el.size || 22) * 1.2));
  } else if (el.type === "image" && el._img) {
    ctx.drawImage(el._img, el.x, el.y, el.w, el.h);
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, w) {
  const head = 8 + w * 2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function bounds(el) {
  if (el.type === "rect" || el.type === "circle" || el.type === "image") {
    return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
  }
  if (el.type === "line" || el.type === "arrow") {
    return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
  }
  if (el.type === "text") {
    ctx.font = `700 ${el.size || 22}px Nunito, sans-serif`;
    const lines = el.text.split("\n");
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    return { x: el.x, y: el.y, w, h: lines.length * (el.size || 22) * 1.2 };
  }
  if (el.points) {
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function drawSelection() {
  if (!selectedId) return;
  const el = elements.find(e => e.id === selectedId);
  if (!el) return;
  const b = bounds(el);
  ctx.save();
  ctx.strokeStyle = "#7c5cff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  if (el.type === "image") {       // manija de redimensión (esquina inferior derecha)
    ctx.setLineDash([]); ctx.fillStyle = "#7c5cff";
    ctx.fillRect(b.x + b.w - 6, b.y + b.h - 6, 14, 14);
  }
  ctx.restore();
}

// ---------- Pruebas de impacto ----------
function hitResizeHandle(el, p) {
  if (el.type !== "image") return false;
  const b = bounds(el);
  return p.x >= b.x + b.w - 6 && p.x <= b.x + b.w + 8 && p.y >= b.y + b.h - 6 && p.y <= b.y + b.h + 8;
}
function hitElement(el, p) {
  const b = bounds(el);
  const pad = (el.width || 6) + 6;
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}
function topElementAt(p) {
  for (let i = elements.length - 1; i >= 0; i--) if (hitElement(elements[i], p)) return elements[i];
  return null;
}

// ---------- Eventos de puntero ----------
function down(e) {
  if (e.target === textInput) return;
  e.preventDefault();
  const p = pos(e);

  if (tool === "select") {
    const sel = selectedId && elements.find(el => el.id === selectedId);
    if (sel && hitResizeHandle(sel, p)) {
      dragMode = "resize"; dragStart = { x: p.x, y: p.y, w: sel.w, h: sel.h, ratio: sel.w / sel.h };
      return;
    }
    const hit = topElementAt(p);
    selectedId = hit ? hit.id : null;
    if (hit) { dragMode = "move"; dragStart = { x: p.x, y: p.y, ox: bounds(hit).x, oy: bounds(hit).y, el: snapshot(hit) }; }
    render();
    return;
  }

  if (tool === "eraser") { eraseAt(p); return; }

  if (tool === "text") {
    openTextInput(p);
    return;
  }

  const id = CLIENT_ID + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (tool === "pencil" || tool === "highlighter") {
    drawing = { id, type: tool === "highlighter" ? "highlighter" : "path", color, width: lineWidth, points: [p] };
  } else if (tool === "line" || tool === "arrow") {
    drawing = { id, type: tool, color, width: lineWidth, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  } else if (tool === "rect" || tool === "circle") {
    drawing = { id, type: tool, color, width: lineWidth, x: p.x, y: p.y, w: 0, h: 0 };
  }
  render();
}

function move(e) {
  const p = pos(e);

  if (tool === "select" && dragMode) {
    const el = elements.find(x => x.id === selectedId);
    if (!el) return;
    if (dragMode === "move") {
      const dx = p.x - dragStart.x, dy = p.y - dragStart.y;
      translate(el, dx, dy, dragStart.el);
    } else if (dragMode === "resize") {
      el.w = Math.max(20, dragStart.w + (p.x - dragStart.x) * Math.sign(el.w || 1));
      if (lockRatio && dragStart.ratio) el.h = Math.max(20, el.w / dragStart.ratio);
      else el.h = Math.max(20, dragStart.h + (p.y - dragStart.y) * Math.sign(el.h || 1));
    }
    render();
    return;
  }

  if (tool === "eraser" && e.buttons) { eraseAt(p); return; }
  if (!drawing) return;

  if (drawing.points) drawing.points.push(p);
  else if (drawing.type === "line" || drawing.type === "arrow") { drawing.x2 = p.x; drawing.y2 = p.y; }
  else { drawing.w = p.x - drawing.x; drawing.h = p.y - drawing.y; }
  render();
}

function up() {
  if (tool === "select" && dragMode) {
    const el = elements.find(x => x.id === selectedId);
    if (el) SYNC.send({ op: "update", element: serialize(el) });
    dragMode = null; dragStart = null;
    return;
  }
  if (drawing) {
    // descartar trazos/figuras nulos
    const b = bounds(drawing);
    const tiny = (drawing.points && drawing.points.length < 2) || (!drawing.points && b.w < 3 && b.h < 3 && drawing.type !== "text");
    if (!tiny) {
      elements.push(drawing);
      SYNC.send({ op: "add", element: serialize(drawing) });
    }
    drawing = null;
    render();
  }
}

function translate(el, dx, dy, orig) {
  if (el.points) el.points = orig.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  else if (el.type === "line" || el.type === "arrow") { el.x1 = orig.x1 + dx; el.y1 = orig.y1 + dy; el.x2 = orig.x2 + dx; el.y2 = orig.y2 + dy; }
  else { el.x = orig.x + dx; el.y = orig.y + dy; }
}
function snapshot(el) { return JSON.parse(JSON.stringify({ points: el.points, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, x: el.x, y: el.y })); }

function eraseAt(p) {
  const before = elements.length;
  const removed = [];
  elements = elements.filter(el => {
    if (hitElement(el, p)) { removed.push(el.id); return false; }
    return true;
  });
  if (elements.length !== before) {
    removed.forEach(id => SYNC.send({ op: "remove", id }));
    if (removed.includes(selectedId)) selectedId = null;
    render();
  }
}

// Mouse + táctil
canvas.addEventListener("mousedown", down);
window.addEventListener("mousemove", move);
window.addEventListener("mouseup", up);
// Rueda del ratón: zoom hacia el cursor
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const s = screenPos(e);
  zoomAt(s.x, s.y, e.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });

// Botones de zoom (centrado en el lienzo)
function zoomCenter(factor) {
  const r = canvas.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, factor);
}
document.getElementById("pzZoomIn").addEventListener("click", () => zoomCenter(1.2));
document.getElementById("pzZoomOut").addEventListener("click", () => zoomCenter(1 / 1.2));
document.getElementById("pzZoomReset").addEventListener("click", zoomReset);

// Gestos táctiles: 1 dedo dibuja · 2 dedos = pellizcar (zoom) + arrastrar (desplazar)
let gesture = null;
function pinchInfo(e) {
  const r = canvas.getBoundingClientRect();
  const a = e.touches[0], b = e.touches[1];
  return {
    cx: (a.clientX + b.clientX) / 2 - r.left,
    cy: (a.clientY + b.clientY) / 2 - r.top,
    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  };
}
canvas.addEventListener("touchstart", e => {
  if (e.touches.length >= 2) { drawing = null; gesture = pinchInfo(e); e.preventDefault(); return; }
  down(e);
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (gesture && e.touches.length >= 2) {
    const g = pinchInfo(e);
    const wx = (gesture.cx - tx) / scale, wy = (gesture.cy - ty) / scale;
    scale = clamp(scale * (g.dist / gesture.dist), 0.25, 6);
    tx = g.cx - wx * scale; ty = g.cy - wy * scale;   // mantener punto bajo los dedos
    render(); updateZoomLabel();
    gesture = g;
    return;
  }
  move(e);
}, { passive: false });
canvas.addEventListener("touchend", e => { if (e.touches.length < 2) gesture = null; up(e); });

// Bloqueo de proporción
document.getElementById("pzLock").addEventListener("click", () => {
  lockRatio = !lockRatio;
  const b = document.getElementById("pzLock");
  b.classList.toggle("active", lockRatio);
  b.textContent = lockRatio ? "🔒" : "🔓";
});

// ---------- Texto ----------
let textPos = null;
function openTextInput(p) {
  textPos = p;
  const r = canvas.getBoundingClientRect();
  textInput.style.left = (r.left + p.x) + "px";
  textInput.style.top = (r.top + p.y) + "px";
  textInput.style.color = color;
  textInput.style.fontSize = Math.max(16, lineWidth * 4) + "px";
  textInput.style.display = "block";
  textInput.value = "";
  setTimeout(() => textInput.focus(), 0);
}
function commitText() {
  if (textInput.style.display === "none") return;
  const val = textInput.value.trim();
  textInput.style.display = "none";
  if (val && textPos) {
    const el = {
      id: CLIENT_ID + "-" + Date.now().toString(36),
      type: "text", color, size: Math.max(16, lineWidth * 4), x: textPos.x, y: textPos.y, text: val
    };
    elements.push(el);
    SYNC.send({ op: "add", element: serialize(el) });
    render();
  }
  textPos = null;
}
textInput.addEventListener("blur", commitText);
textInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } });

// ---------- Imágenes ----------
document.getElementById("pzImage").addEventListener("change", e => {
  [...e.target.files].forEach(file => {
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result);
    reader.readAsDataURL(file);
  });
  e.target.value = "";
});

function addImage(src, id) {
  const img = new Image();
  img.onload = () => {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const scale = Math.min(1, (w * 0.5) / img.width, (h * 0.5) / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    const el = {
      id: id || (CLIENT_ID + "-img-" + Date.now().toString(36)),
      type: "image", x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih, src
    };
    el._img = img;
    elements.push(el);
    if (!id) SYNC.send({ op: "add", element: serialize(el) });
    render();
  };
  img.src = src;
}

// ---------- Limpiar ----------
document.getElementById("pzClear").addEventListener("click", () => {
  if (!elements.length || confirm("¿Borrar toda la pizarra?")) {
    elements = []; selectedId = null; render();
    SYNC.send({ op: "clear" });
  }
});

// ---------- Serialización (sin el objeto Image en vivo) ----------
function serialize(el) { const c = { ...el }; delete c._img; return c; }

// ---------- Herramientas (UI) ----------
document.querySelectorAll(".pz-tool").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pz-tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tool = btn.dataset.tool;
    if (tool !== "select") selectedId = null;
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    render();
  });
});

const swatches = document.getElementById("pzSwatches");
COLORS.forEach((c, i) => {
  const s = document.createElement("div");
  s.className = "pz-swatch" + (i === 0 ? " active" : "");
  s.style.background = c;
  s.addEventListener("click", () => {
    color = c;
    document.querySelectorAll(".pz-swatch").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
  });
  swatches.appendChild(s);
});

document.getElementById("pzSize").addEventListener("input", e => { lineWidth = +e.target.value; });

// Suprimir/Backspace borra el elemento seleccionado
window.addEventListener("keydown", e => {
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId && document.activeElement !== textInput) {
    elements = elements.filter(el => el.id !== selectedId);
    SYNC.send({ op: "remove", id: selectedId });
    selectedId = null; render();
  }
});

// ============================================================
//  CALCULADORA
// ============================================================
(function () {
  const panel = document.getElementById("pzCalcPanel");
  const display = document.getElementById("pzCalcDisplay");
  const keys = document.getElementById("pzCalcKeys");
  let expr = "";

  const layout = [
    ["C", "←", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "−"],
    ["1", "2", "3", "+"],
    ["0", ".", "=", ""]
  ];
  const opClass = { "÷": "op", "×": "op", "−": "op", "+": "op", "%": "op", "C": "clr", "←": "clr", "=": "eq" };

  layout.flat().forEach(k => {
    if (!k) { keys.appendChild(document.createElement("span")); return; }
    const b = document.createElement("button");
    b.textContent = k;
    if (opClass[k]) b.className = opClass[k];
    b.addEventListener("click", () => press(k));
    keys.appendChild(b);
  });

  function press(k) {
    if (k === "C") { expr = ""; }
    else if (k === "←") { expr = expr.slice(0, -1); }
    else if (k === "=") { compute(); return; }
    else { expr += k; }
    display.value = expr || "0";
  }
  function compute() {
    try {
      const js = expr.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-").replace(/%/g, "/100");
      if (!/^[-+*/.()0-9\s]+$/.test(js)) throw 0;
      const r = Function('"use strict";return (' + js + ')')();
      expr = (Math.round(r * 1e6) / 1e6).toString();
      display.value = expr;
    } catch { display.value = "Error"; expr = ""; }
  }

  document.getElementById("pzCalc").addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("pzCalcClose").addEventListener("click", () => panel.classList.remove("open"));

  // Arrastrar la calculadora por su cabecera
  const head = panel.querySelector(".pz-calc-head");
  let dx, dy, moving = false;
  head.addEventListener("mousedown", e => {
    if (e.target.id === "pzCalcClose") return;
    moving = true; const r = panel.getBoundingClientRect();
    dx = e.clientX - r.left; dy = e.clientY - r.top;
    panel.style.right = "auto"; panel.style.bottom = "auto";
  });
  window.addEventListener("mousemove", e => {
    if (!moving) return;
    panel.style.left = (e.clientX - dx) + "px";
    panel.style.top = (e.clientY - dy) + "px";
  });
  window.addEventListener("mouseup", () => { moving = false; });
})();

// ============================================================
//  PARTICIPANTES
// ============================================================
function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}
function sessionName() {
  const s = getSession();
  if (!s) return "Invitado";
  return s.role === "admin" ? "Papá" : (s.username === "luanna" ? "Luanna" : s.username);
}
function renderPresence(data) {
  const box = document.getElementById("pzPresence");
  const ahora = Date.now();
  const list = Object.values(data || {})
    .filter(p => p && p.name && (ahora - (p.t || 0) < 86400000)); // ignora muy antiguos
  if (!list.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="pz-pr-title">Participantes</div>` +
    list.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
      .map(p => `<div class="pz-pr-item ${p.online ? "online" : ""}">
        <span class="pz-pr-dot"></span>${escapeHtml(p.name)}</div>`).join("");
}

// ============================================================
//  CAPA DE SINCRONIZACIÓN
// ============================================================
function applyOp(msg) {
  if (!msg || msg.from === CLIENT_ID) return;
  if (msg.op === "clear") { elements = []; selectedId = null; render(); return; }
  if (msg.op === "remove") { elements = elements.filter(e => e.id !== msg.id); render(); return; }
  if (msg.op === "add" || msg.op === "update") {
    const el = msg.element;
    if (el.type === "image") {
      const existing = elements.find(e => e.id === el.id);
      if (existing) { Object.assign(existing, el); existing._img = existing._img || null; render(); }
      else addImage(el.src, el.id), setTimeout(() => { const t = elements.find(e => e.id === el.id); if (t) { Object.assign(t, el); render(); } }, 60);
      return;
    }
    const idx = elements.findIndex(e => e.id === el.id);
    if (idx >= 0) elements[idx] = el; else elements.push(el);
    render();
  }
}

const SYNC = (function () {
  // --- Firebase (tiempo real ENTRE dispositivos) ---
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

  const syncEl = document.getElementById("pzSync");
  const syncTxt = document.getElementById("pzSyncText");

  // --- BroadcastChannel: tiempo real entre pestañas del MISMO dispositivo ---
  let bc = null;
  try {
    bc = new BroadcastChannel(ROOM);
    bc.onmessage = ev => applyOp(ev.data);
  } catch (e) { /* navegador sin soporte */ }

  // --- Firebase Realtime Database ---
  let fbRef = null;
  function initFirebase() {
    if (typeof firebase === "undefined" || !FIREBASE_CONFIG.databaseURL) return false;
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      const joinAt = Date.now();
      fbRef = firebase.database().ref("rooms/" + ROOM + "/ops");
      // Solo operaciones POSTERIORES al ingreso → la pizarra arranca en blanco.
      fbRef.orderByChild("t").startAt(joinAt).on("child_added", snap => applyOp(snap.val()));
      // Presencia: nombre + en línea / desconectado.
      // Clave estable por usuario (rol) para no dejar copias "fantasma" al recargar.
      const s = getSession();
      const presKey = s ? s.role + "-" + (s.username || "x") : "invitado";
      const meRef = firebase.database().ref("rooms/" + ROOM + "/presence/" + presKey);
      const name = sessionName();
      firebase.database().ref(".info/connected").on("value", s => {
        const on = s.val() === true;
        syncEl.classList.toggle("live", on);
        syncTxt.textContent = on ? "En línea" : "Conectando…";
        if (on) {
          meRef.onDisconnect().update({ online: false, t: Date.now() });
          meRef.set({ name, online: true, t: Date.now() });
        }
      });
      firebase.database().ref("rooms/" + ROOM + "/presence").on("value", s => renderPresence(s.val()));

      window._fbSend = (msg) => { fbRef.push({ ...msg, t: Date.now() }); };
      return true;
    } catch (e) {
      console.warn("Firebase no disponible:", e);
      return false;
    }
  }

  function send(msg) {
    msg.from = CLIENT_ID;
    if (bc) bc.postMessage(msg);
    if (window._fbSend) window._fbSend(msg);
  }

  if (!initFirebase()) {
    syncTxt.textContent = bc ? "Mismo dispositivo" : "Local";
  }

  return { send };
})();

// ---------- Arranque ----------
resizeCanvas();

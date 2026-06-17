// ============================================================
//  MODO JUEGO · ADIVINA EL DIBUJO  (módulo independiente)
// ------------------------------------------------------------
//  Se carga DESPUÉS de pizarra.js. Comparte el scope global
//  (SYNC, elements, presenceData, escapeHtml, setTool, GAME_endBtn).
//  La pizarra es una herramienta de dibujo pura; este módulo
//  añade encima la capa de juego y bloquea el lienzo vía
//  GAME.blockPointer() / GAME.blockTool() (guardados con typeof).
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

  // ---- Modo "Pinturillo" en móvil/tablet (≤1024px) ----
  // En pantallas chicas, mientras el panel del juego está abierto, el canvas y
  // el panel deben convivir apilados en una sola pantalla (en vez de que el
  // panel tape el lienzo como overlay). Para lograrlo sin tocar la lógica de
  // dibujo: se reubica #pzGamePanel para que sea HERMANO de #pzStage (en vez
  // de hijo suyo) y CSS (.pz-game-mobile) los apila en columna; al recalcular
  // tamaños se llama a resizeCanvas(), que ya lee el tamaño real de #pzStage.
  function isSmallScreen() { return window.matchMedia("(max-width: 1024px)").matches; }
  function relocateGamePanel(toMobile) {
    const stageEl = document.getElementById("pzStage"), panel = document.getElementById("pzGamePanel");
    if (!stageEl || !panel) return;
    const center = stageEl.parentElement;
    if (toMobile) { if (center && panel.parentElement !== center) center.appendChild(panel); }
    else if (panel.parentElement !== stageEl) stageEl.appendChild(panel);
  }
  function updateMobileGameMode() {
    const g = state, small = isSmallScreen();
    const active = gameOpen && small;
    document.body.classList.toggle("pz-game-mobile", active);
    const inMatch = active && g && g.status !== "config";
    const drawingNow = inMatch && g.status === "playing" && g.drawer === MY_KEY;
    document.body.classList.toggle("pz-drawing", !!drawingNow);
    document.body.classList.toggle("pz-guessing", !!(inMatch && !drawingNow));
    relocateGamePanel(active);
    if (typeof resizeCanvas === "function") resizeCanvas();
    if (typeof renderPresence === "function" && typeof presenceData !== "undefined") renderPresence(presenceData);
  }
  window.addEventListener("resize", updateMobileGameMode);

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
  // Calcula quién dibuja a continuación SIN avanzar el turno todavía
  // (se usa para anunciarlo ya en el resumen de la ronda que acaba de terminar).
  function peekNextDrawer(g) {
    let idx = g.queue.indexOf(g.drawer), next = null;
    for (let i = 1; i <= g.queue.length; i++) { const cand = g.queue[(idx + i) % g.queue.length]; if (isOnline(cand)) { next = cand; break; } }
    if (!next) next = onlineKeys()[0];
    return next;
  }
  function nextTurn(g) {
    const next = peekNextDrawer(g);
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
    const nextKey = peekNextDrawer(g);
    gameRef.update({ status: "roundEnd", roundEndTs: Date.now(), scores, roundResult: { word: g.word, drawerName: nameOf(g.drawer), got, total: nd.length, dpts, bonus, nextKey, nextName: nameOf(nextKey) } });
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
    const smallActive = g && g.status !== "config" && isSmallScreen() && (g.status === "playing" || g.status === "choosing" || g.status === "roundEnd");
    if (smallActive) { gameOpen = true; closedByUser = false; }              // en móvil: no se puede "salir" del juego mientras hay partida
    else if (g && g.status !== "config" && !gameOpen && !closedByUser) gameOpen = true;
    if (g && g.status === "roundEnd" && lastStatus !== "roundEnd") celebrate();
    // Al empezar a dibujar, el dibujante recibe el pincel básico por defecto
    // y, en pantallas chicas, un grosor fijo (no hay selector de grosor ahí).
    if (g && g.status === "playing" && g.drawer === MY_KEY && lastStatus !== "playing") {
      if (typeof setTool === "function") setTool("pencil");
      if (isSmallScreen() && typeof lineWidth !== "undefined") lineWidth = 8;
    }
    lastStatus = g ? g.status : null;
    document.getElementById("pzPlayBtn").classList.toggle("on", !!(g && g.status !== "config"));
    const sr = document.getElementById("pzStarsRow"); if (sr && (!g || g.status !== "playing")) sr.classList.remove("show");
    if (typeof GAME_endBtn !== "undefined" && GAME_endBtn) GAME_endBtn.style.display = (g && g.status !== "config") ? "" : "none";
    updateMobileGameMode();
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
      if (Date.now() - (g.roundEndTs || 0) > 4200) nextTurn(g);   // ranking + anuncio del próximo dibujante ~4.2s
    }
  }, 1000);
  // #4 — fila de estrellas bajo la pizarra: 1 estrella por jugador, encendida si adivinó
  function starsRow(g) {
    const row = document.getElementById("pzStarsRow"); if (!row) return;
    if (!g || g.status !== "playing") { row.classList.remove("show"); return; }
    const nd = nonDrawers(g);
    row.innerHTML = nd.map(k => `<span class="${g.guessed && g.guessed[k] ? "on" : ""}">★</span>`).join("");
    // Solo sobre el canvas (panel cerrado): con el panel abierto el marcador ya
    // muestra el progreso y la fila se superpondría al chat (sobre todo fullscreen).
    row.classList.toggle("show", nd.length > 0 && !gameOpen);
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
    // Preservar foco/texto/caret del chat: el re-render por cada mensaje
    // reconstruye el <input> y, sin esto, se pierde lo que se está escribiendo.
    const _pf = (function () { const p = document.getElementById("pzgInput"); return p ? { focus: document.activeElement === p, val: p.value, sel: p.selectionStart } : null; })();
    // Panel abierto cubre el canvas: ocultar ya la fila de estrellas para que no
    // se superponga al chat (el marcador del panel ya muestra el progreso).
    const _sr = document.getElementById("pzStarsRow"); if (_sr) _sr.classList.remove("show");
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

const rank = Object.keys(g.scores || {})
  .sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));

const stopBtn = iAmHost(g)
  ? `<button class="pzg-stop" id="pzgStop" title="Terminar juego">⏹</button>`
  : "";

const metaSec = `
  <div class="pzg-sec">
    <div class="pzg-meta">
      <span>✏️ Dibuja: <b>${escapeHtml(nameOf(g.drawer))}</b></span>
      <span>Ronda <b>${g.round}</b> ${stopBtn}</span>
    </div>
  </div>`;

// Tarjeta de ranking + anuncio de quién dibuja a continuación.
// Solo existe mientras g.status === "roundEnd" (unos segundos): se inserta
// ANTES del chat (nunca encima) y desaparece sola al pasar a la siguiente ronda,
// por lo que jamás queda fija tapando la ventana de chat.
const nextName = g.roundResult && g.roundResult.nextName ? escapeHtml(g.roundResult.nextName) : "";
const scorePanel = g.status === "roundEnd"
  ? `<div class="pzg-sec">
       <div class="pzg-title">⭐ Puntuación</div>
       ${scoreRows(g, rank)}
       ${nextName ? `<div style="margin-top:10px;text-align:center;font-weight:800;color:var(--purple-dark);font-size:.92rem">▶️ Ahora le toca dibujar a <b>${nextName}</b></div>` : ""}
     </div>`
  : "";

    // --- Elegir palabra ---
    if (g.status === "choosing") {
      const choiceHtml = meDrawer
        ? `<div class="pzg-sec">
             <div class="pzg-title">✏️ Elige qué dibujar</div>
             <div class="pzg-choices">${(g.choices || []).map(w => `<button class="pzg-choice" data-w="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}</div>
           </div>`
        : `<div class="pzg-sec"><p style="text-align:center;font-weight:800;color:var(--purple-dark);padding:10px 0">✏️ <b>${escapeHtml(nameOf(g.drawer))}</b> está eligiendo una palabra…</p></div>`;
      body.innerHTML = head + metaSec + scorePanel + choiceHtml;
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
    // En móvil, mientras es tu turno de dibujar, el chat se reemplaza por un
    // indicador de progreso (no necesitas leer respuestas, solo ver cuántos
    // ya acertaron) — así libera espacio y evita ver pistas de la palabra.
    const mobileDrawing = meDrawer && g.status === "playing" && isSmallScreen();
    const ndAll = nonDrawers(g), gotN = ndAll.filter(k => g.guessed && g.guessed[k]).length;
    const bottomSec = mobileDrawing
      ? `<div class="pzg-sec grow pzg-drawindicator">
           <div class="pzg-title">Progreso de aciertos</div>
           <div class="pzg-bigstars">${ndAll.map(k => `<span class="${g.guessed && g.guessed[k] ? "on" : ""}">★</span>`).join("") || "<span>—</span>"}</div>
           <div class="pzg-progresstext">${gotN} de ${ndAll.length} adivinaron</div>
         </div>`
      : `<div class="pzg-sec grow">
           <div class="pzg-title">Chat — escribe tu respuesta</div>
           <div class="pzg-chat" id="pzgChat">${chatHtml}</div>
           <div class="pzg-chatform">
             <input id="pzgInput" placeholder="${meDrawer ? "Tú dibujas 🎨" : (guessedMe ? "¡Ya adivinaste! 🌟" : (canGuess ? "Escribe tu respuesta…" : "Espera…"))}" ${canGuess ? "" : "disabled"}>
             <button id="pzgSend" ${canGuess ? "" : "disabled"}>➤</button>
           </div>
         </div>`;

    body.innerHTML = head + metaSec + `
      <div class="pzg-sec pzg-timer">
        <div class="pzg-title" style="display:flex;justify-content:center;gap:8px;align-items:center">Tiempo restante <button class="pzg-mute" id="pzgMute" title="Silenciar">${muted ? "🔇" : "🔊"}</button></div>
        <div class="pzg-time" id="pzgTime">${fmt(remaining(g))}</div>
        <div class="pzg-bar"><div id="pzgBar" style="width:${remaining(g) / g.turnSeconds * 100}%"></div></div>
        ${reveal || wordHtml}
      </div>` + scorePanel + bottomSec;
    wireClose(); wireStop();
    const chatBox = document.getElementById("pzgChat"); if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    const mb = document.getElementById("pzgMute"); if (mb) mb.onclick = () => { muted = !muted; renderGame(); };
    const inp = document.getElementById("pzgInput"), snd = document.getElementById("pzgSend");
    if (snd && !snd.disabled) {
      // Limpiar ANTES de enviar: Firebase dispara el re-render síncrono dentro de
      // sendGuess y, si no, el capturador de foco re-escribe el texto ya enviado.
      const go = () => { const v = inp.value; if (v.trim()) { inp.value = ""; sendGuess(v); inp.focus(); } };
      snd.onclick = go;
      inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    }
    // Restaurar lo que el jugador estaba escribiendo + el foco tras el re-render,
    // para encadenar intentos (perro→Enter→gato→Enter…) sin volver a hacer clic.
    if (_pf && inp && !inp.disabled) {
      if (_pf.val) inp.value = _pf.val;
      if (_pf.focus) { inp.focus(); try { inp.setSelectionRange(_pf.sel, _pf.sel); } catch (e) {} }
    }
  }
  function wireStop() { const s = document.getElementById("pzgStop"); if (s) s.onclick = () => { if (confirm("¿Terminar el juego para todos?")) gameRef.remove(); }; }
  function scoreRows(g, rank) {
    const medals = ["🥇", "🥈", "🥉"];
    return rank.map((k, i) => `<div class="pzg-score${k === MY_KEY ? " me" : ""}"><span class="medal">${medals[i] || ""}</span><span class="nm">${escapeHtml(nameOf(k))}${k === g.drawer ? " ✏️" : ""}</span><span class="st">⭐ ${g.scores[k] || 0}</span></div>`).join("");
  }
  function wireClose() { const c = document.getElementById("pzgClose"); if (c) c.onclick = () => { gameOpen = false; closedByUser = true; updateMobileGameMode(); renderGame(); document.getElementById("pzPlayBtn").classList.remove("on"); }; }

  // Botón JUGAR
  document.getElementById("pzPlayBtn").addEventListener("click", () => {
    gameOpen = !gameOpen; closedByUser = !gameOpen;
    if (gameOpen) { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    updateMobileGameMode();
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

// ===== Panel de administración =====

const session = requireAuth(["admin"]);
let DATA = null;

const recDate = document.getElementById("recDate");

// Progreso de la semana actual (hasta hoy), para el ánimo del avatar
function weekPctAdmin() {
  const days = weekDates(mondayOf(new Date()));
  const today = todayStr();
  const pastDays = days.filter(d => d <= today);
  const got = pastDays.reduce((sum, d) => sum + starsForDay(DATA, d), 0);
  const possible = pastDays.reduce((sum, d) =>
    sum + (isWeekend(d) ? CONFIG.dailyMax.weekend : CONFIG.dailyMax.weekday), 0);
  return possible ? Math.round((got / possible) * 100) : 0;
}

function renderPapaAvatar() {
  applyMoods(computeStats(DATA).currentStreak, weekPctAdmin());
  document.getElementById("papaSlot").innerHTML = imgOrPlaceholder("avatar_papa", "round");
}

(async function init() {
  if (!session) return;
  DATA = await loadData();
  recDate.value = todayStr();
  recDate.addEventListener("change", renderDayForm);
  document.getElementById("saveDayBtn").addEventListener("click", saveDay);
  document.getElementById("addMsgBtn").addEventListener("click", addMessage);
  document.getElementById("exportBtn").addEventListener("click", () => exportData(DATA));
  document.getElementById("importFile").addEventListener("change", importFile);
  document.getElementById("publishBtn").addEventListener("click", publishData);
  document.getElementById("ghCfgBtn").addEventListener("click", toggleGhCfg);
  document.getElementById("ghSaveBtn").addEventListener("click", saveGhCfg);
  document.getElementById("histPeriod").addEventListener("change", renderHistory);
  loadGhCfgIntoForm();
  renderAll();
})();

// ===== Publicación en GitHub =====
// La configuración (repo, rama y token) se guarda solo en este navegador.

const GH_CFG_KEY = "luanna_gh_cfg";

function getGhCfg() {
  try { return JSON.parse(localStorage.getItem(GH_CFG_KEY)) || {}; } catch { return {}; }
}

const GH_FIELDS = ["ghRepo", "ghBranch", "ghToken"];

function loadGhCfgIntoForm() {
  const cfg = getGhCfg();
  document.getElementById("ghRepo").value = cfg.repo || "";
  document.getElementById("ghBranch").value = cfg.branch || "main";
  document.getElementById("ghToken").value = cfg.token || "";
}

// "Configurar" habilita los campos para editar; "💾 Guardar" los protege de nuevo
function toggleGhCfg() {
  const enable = document.getElementById("ghRepo").disabled;
  GH_FIELDS.forEach(id => document.getElementById(id).disabled = !enable);
  if (enable) document.getElementById("ghRepo").focus();
}

function saveGhCfg() {
  const cfg = {
    repo: document.getElementById("ghRepo").value.trim(),
    branch: document.getElementById("ghBranch").value.trim() || "main",
    token: document.getElementById("ghToken").value.trim()
  };
  const st = document.getElementById("ghCfgStatus");
  if (!cfg.repo.includes("/") || !cfg.token) {
    st.style.color = "#e85a6e";
    st.textContent = "Completa el repositorio (usuario/repo) y el token.";
    return;
  }
  localStorage.setItem(GH_CFG_KEY, JSON.stringify(cfg));
  GH_FIELDS.forEach(id => document.getElementById(id).disabled = true);
  st.style.color = "var(--green)";
  st.textContent = "✔ Configuración guardada en este navegador.";
}

async function publishData() {
  const cfg = getGhCfg();
  const btn = document.getElementById("publishBtn");
  if (!cfg.token || !cfg.repo) {
    GH_FIELDS.forEach(id => document.getElementById(id).disabled = false);
    document.getElementById("ghRepo").focus();
    flashSaved("⚙ Primero configura la publicación");
    return;
  }
  btn.disabled = true;
  btn.textContent = "⏳ Publicando...";
  try {
    const api = `https://api.github.com/repos/${cfg.repo}/contents/data/data.json`;
    const headers = {
      "Authorization": `Bearer ${cfg.token}`,
      "Accept": "application/vnd.github+json"
    };
    // 1. Obtener el sha actual del archivo (necesario para actualizarlo)
    let sha;
    const cur = await fetch(`${api}?ref=${cfg.branch}`, { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error(`No se pudo leer el repo (HTTP ${cur.status})`);
    // 2. Subir el data.json actualizado (contenido en base64, con soporte de tildes/emojis)
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(DATA, null, 2))));
    const res = await fetch(api, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Actualización de actividades — ${todayStr()}`,
        content, sha, branch: cfg.branch
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    flashSaved("✔ Publicado: en 1-2 min se verá en todos los dispositivos");
  } catch (e) {
    console.error(e);
    flashSaved("✕ Error al publicar: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Publicar cambios";
  }
}

function renderAll() {
  renderPapaAvatar();
  renderDayForm();
  renderMessages();
  renderStats();
  renderHistory();
}

function flashSaved(text) {
  const el = document.getElementById("saveStatus");
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 2500);
}

// ----- Registro diario -----

function renderDayForm() {
  const d = recDate.value;
  const rec = DATA.records[d] || {};
  const weekend = isWeekend(d);

  // Tres estados: ✔ realizado · ✖ no realizado · sin marcar = sin información
  const row = (a, disabled) => {
    const st = rec[a.id]?.done;
    return `
    <div class="activity-row" style="${disabled ? "opacity:.45" : ""}">
      <span class="name">${a.icon} ${a.name} <small>(⭐${a.stars})</small></span>
      <label class="cb-cell" title="Realizado">
        <input type="checkbox" class="cb-yes" data-yes="${a.id}" ${st === true ? "checked" : ""} ${disabled ? "disabled" : ""}>
      </label>
      <label class="cb-cell" title="No realizado">
        <input type="checkbox" class="cb-no" data-no="${a.id}" ${st === false ? "checked" : ""} ${disabled ? "disabled" : ""}>
      </label>
      <label class="cb-cell" title="Sin marcar">
        <input type="radio" class="cb-none" data-none="${a.id}" ${st === undefined ? "checked" : ""} ${disabled ? "disabled" : ""}>
      </label>
    </div>`;
  };

  const header = `
    <div class="activity-row activity-head">
      <span class="name"></span>
      <span class="cb-cell head-yes" title="Realizado"><svg width="14" height="14" viewBox="0 0 12 12"><path d="M2 6.5L5 9.5L10 3" stroke="#2eb872" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="cb-cell head-no" title="No realizado"><svg width="13" height="13" viewBox="0 0 12 12"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="#e85a6e" stroke-width="2.4" stroke-linecap="round"/></svg></span>
      <span class="cb-cell head-none" title="Sin marcar"><svg width="14" height="14" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" stroke="#8d83b5" stroke-width="2" fill="none"/></svg></span>
    </div>`;

  document.getElementById("activityForm").innerHTML =
    `<p style="font-weight:700;color:var(--purple-dark);margin:6px 0">🏠 Responsabilidades</p>` +
    header +
    CONFIG.activities.responsibilities.map(a => row(a, false)).join("") +
    `<p style="font-weight:700;color:#2563b0;margin:10px 0 6px">📚 Aprendizaje ${weekend ? "(no aplica en fin de semana)" : ""}</p>` +
    header +
    CONFIG.activities.learning.map(a => row(a, weekend)).join("");

  // Los tres estados son excluyentes entre sí
  const syncNone = id => {
    const yes = document.querySelector(`[data-yes="${id}"]`);
    const no = document.querySelector(`[data-no="${id}"]`);
    document.querySelector(`[data-none="${id}"]`).checked = !yes.checked && !no.checked;
  };
  document.querySelectorAll("[data-yes]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) document.querySelector(`[data-no="${cb.dataset.yes}"]`).checked = false;
      syncNone(cb.dataset.yes);
    });
  });
  document.querySelectorAll("[data-no]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) document.querySelector(`[data-yes="${cb.dataset.no}"]`).checked = false;
      syncNone(cb.dataset.no);
    });
  });
  document.querySelectorAll("[data-none]").forEach(rb => {
    rb.addEventListener("click", () => {
      document.querySelector(`[data-yes="${rb.dataset.none}"]`).checked = false;
      document.querySelector(`[data-no="${rb.dataset.none}"]`).checked = false;
      rb.checked = true;
    });
  });

  document.getElementById("dayNote").value = rec.note || "";
  document.getElementById("readingTitle").value =
    (DATA.readings || []).find(r => r.date === d)?.title || "";
  document.getElementById("mathTopic").value =
    (DATA.mathTopics || []).find(t => t.date === d)?.topic || "";
}

function saveDay() {
  const d = recDate.value;
  if (!d) return;
  const rec = {};
  document.querySelectorAll("[data-yes]").forEach(cb => {
    const id = cb.dataset.yes;
    const noCb = document.querySelector(`[data-no="${id}"]`);
    if (cb.checked) rec[id] = { done: true };
    else if (noCb.checked) rec[id] = { done: false };
    // sin marcar → no se guarda nada para esta actividad
  });
  const note = document.getElementById("dayNote").value.trim();
  if (note) rec.note = note;
  DATA.records[d] = rec;

  // Lectura y matemáticas del día (reemplaza entradas previas de esa fecha)
  const title = document.getElementById("readingTitle").value.trim();
  DATA.readings = (DATA.readings || []).filter(r => r.date !== d);
  if (title) DATA.readings.push({ date: d, title });
  DATA.readings.sort((a, b) => a.date.localeCompare(b.date));

  const topic = document.getElementById("mathTopic").value.trim();
  DATA.mathTopics = (DATA.mathTopics || []).filter(t => t.date !== d);
  if (topic) DATA.mathTopics.push({ date: d, topic });
  DATA.mathTopics.sort((a, b) => a.date.localeCompare(b.date));

  saveData(DATA);
  flashSaved("✔ Día guardado");
  renderPapaAvatar();
  renderStats();
  renderHistory();
}

// ----- Mensajes -----

function renderMessages() {
  const list = document.getElementById("msgList");
  const msgs = DATA.messages || [];
  list.innerHTML = msgs.length
    ? msgs.slice().reverse().map((m, i) => `
        <div class="msg-admin-row">
          <span class="text"><b>${m.date}</b> — ${escapeHtml(m.text)}</span>
          <button class="del-btn" data-i="${msgs.length - 1 - i}">✕</button>
        </div>`).join("")
    : `<p style="color:var(--text-soft)">No hay mensajes.</p>`;
  list.querySelectorAll(".del-btn").forEach(btn => {
    btn.onclick = () => {
      DATA.messages.splice(parseInt(btn.dataset.i), 1);
      saveData(DATA);
      renderMessages();
      flashSaved("✔ Mensaje eliminado");
    };
  });
}

function addMessage() {
  const input = document.getElementById("newMsg");
  const text = input.value.trim();
  if (!text) return;
  DATA.messages = DATA.messages || [];
  DATA.messages.push({ date: todayStr(), text });
  input.value = "";
  saveData(DATA);
  renderMessages();
  flashSaved("✔ Mensaje agregado");
}

// ----- Estadísticas -----

function renderStats() {
  const s = computeStats(DATA);

  document.getElementById("statsBox").innerHTML = `
    <table class="history-table">
      <tr><td style="text-align:left">⭐ Estrellas totales</td><td><b>${s.totalStars}</b></td></tr>
      <tr><td style="text-align:left">✅ Días completos</td><td><b>${s.fullDays}</b> de ${s.daysRecorded} registrados</td></tr>
      <tr><td style="text-align:left">🔥 Racha actual / mejor</td><td><b>${s.currentStreak}</b> / ${s.bestStreak} días</td></tr>
      <tr><td style="text-align:left">🏆 Semanas perfectas</td><td><b>${s.perfectWeeks}</b></td></tr>
      <tr><td style="text-align:left">📖 Lecturas registradas</td><td><b>${s.readings}</b></td></tr>
      <tr><td style="text-align:left">🔢 Días de matemáticas</td><td><b>${s.mathDays}</b></td></tr>
      <tr><td style="text-align:left">🏅 Nivel actual</td><td><b>${s.level.name}</b> (Nivel ${s.level.level})</td></tr>
    </table>`;
}

// ----- Historial -----

function renderHistory() {
  // Selector de periodo: últimos 30 días o un mes específico
  const sel = document.getElementById("histPeriod");
  const allDates = Object.keys(DATA.records).sort().reverse();
  const months = [...new Set(allDates.map(d => d.slice(0, 7)))];
  const current = sel.value || "last30";
  const monthName = m => {
    const [y, mo] = m.split("-");
    const n = new Date(y, mo - 1, 1).toLocaleDateString("es", { month: "long" });
    return n.charAt(0).toUpperCase() + n.slice(1) + " " + y;
  };
  sel.innerHTML = `<option value="last30">Últimos 30 días</option>` +
    months.map(m => `<option value="${m}">${monthName(m)}</option>`).join("");
  sel.value = months.includes(current) || current === "last30" ? current : "last30";

  const dates = sel.value === "last30"
    ? allDates.slice(0, 30)
    : allDates.filter(d => d.startsWith(sel.value));

  if (!dates.length) {
    document.getElementById("historyTable").innerHTML = "<tr><td>Sin registros aún.</td></tr>";
    return;
  }
  const today = todayStr();
  const head = `<tr><th style="text-align:left">Fecha</th>${ALL_ACTIVITIES.map(a => `<th title="${a.name}">${a.icon}</th>`).join("")}<th>⭐</th><th style="text-align:left">Nota</th></tr>`;
  const rows = dates.map(d => {
    const rec = DATA.records[d];
    const cells = ALL_ACTIVITIES.map(a => {
      if (a.weekdaysOnly && isWeekend(d)) return "<td>—</td>";
      if (rec[a.id]?.done === true) return `<td style="color:var(--green);font-weight:900">✔</td>`;
      if (rec[a.id]?.done === false) return `<td style="color:#e85a6e;font-weight:900">✘</td>`;
      return "<td>·</td>";
    }).join("");
    return `<tr>
      <td style="text-align:left"><b>${d}</b></td>${cells}
      <td><b>${starsForDay(DATA, d)}</b></td>
      <td style="text-align:left;font-size:.8rem">${escapeHtml(rec.note || "")}</td>
    </tr>`;
  }).join("");
  document.getElementById("historyTable").innerHTML = head + rows;
}

// ----- Importar -----

function importFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      if (!json.records) throw new Error("Formato inválido");
      DATA = json;
      saveData(DATA);
      renderAll();
      flashSaved("✔ Datos importados");
    } catch {
      flashSaved("✕ Archivo inválido");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function escapeHtml(t) {
  const div = document.createElement("div");
  div.textContent = t;
  return div.innerHTML;
}

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
  renderAll();
})();

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

  const row = (a, disabled) => `
    <div class="activity-row" style="${disabled ? "opacity:.45" : ""}">
      <input type="checkbox" data-act="${a.id}" ${rec[a.id]?.done ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span class="name">${a.icon} ${a.name} <small>(⭐${a.stars})</small></span>
      <input type="number" min="0" max="600" data-min="${a.id}" value="${rec[a.id]?.minutes || ""}"
        placeholder="0" ${disabled ? "disabled" : ""}>
      <span class="min-label">min</span>
    </div>`;

  document.getElementById("activityForm").innerHTML =
    `<p style="font-weight:700;color:var(--purple-dark);margin:6px 0">🏠 Responsabilidades</p>` +
    CONFIG.activities.responsibilities.map(a => row(a, false)).join("") +
    `<p style="font-weight:700;color:#2563b0;margin:10px 0 6px">📚 Aprendizaje ${weekend ? "(no aplica en fin de semana)" : ""}</p>` +
    CONFIG.activities.learning.map(a => row(a, weekend)).join("");

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
  document.querySelectorAll("[data-act]").forEach(cb => {
    const id = cb.dataset.act;
    const minutes = parseInt(document.querySelector(`[data-min="${id}"]`).value) || 0;
    if (cb.checked || minutes) rec[id] = { done: cb.checked, minutes };
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
  const dates = Object.keys(DATA.records).sort();
  let readMin = 0, mathMin = 0, totalMin = 0;
  for (const d of dates) {
    readMin += DATA.records[d].reading?.minutes || 0;
    mathMin += DATA.records[d].math?.minutes || 0;
    totalMin += minutesForDay(DATA, d);
  }
  const h = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`;

  document.getElementById("statsBox").innerHTML = `
    <table class="history-table">
      <tr><td style="text-align:left">⭐ Estrellas totales</td><td><b>${s.totalStars}</b></td></tr>
      <tr><td style="text-align:left">✅ Días completos</td><td><b>${s.fullDays}</b> de ${s.daysRecorded} registrados</td></tr>
      <tr><td style="text-align:left">🔥 Racha actual / mejor</td><td><b>${s.currentStreak}</b> / ${s.bestStreak} días</td></tr>
      <tr><td style="text-align:left">🏆 Semanas perfectas</td><td><b>${s.perfectWeeks}</b></td></tr>
      <tr><td style="text-align:left">📖 Lecturas registradas / tiempo</td><td><b>${s.readings}</b> · ${h(readMin)}</td></tr>
      <tr><td style="text-align:left">🔢 Días de matemáticas / tiempo</td><td><b>${s.mathDays}</b> · ${h(mathMin)}</td></tr>
      <tr><td style="text-align:left">⏱️ Tiempo total de estudio</td><td><b>${h(totalMin)}</b></td></tr>
      <tr><td style="text-align:left">🏅 Nivel actual</td><td><b>${s.level.name}</b> (Nivel ${s.level.level})</td></tr>
    </table>`;
}

// ----- Historial -----

function renderHistory() {
  const dates = Object.keys(DATA.records).sort().reverse().slice(0, 30);
  if (!dates.length) {
    document.getElementById("historyTable").innerHTML = "<tr><td>Sin registros aún.</td></tr>";
    return;
  }
  const today = todayStr();
  const head = `<tr><th style="text-align:left">Fecha</th>${ALL_ACTIVITIES.map(a => `<th title="${a.name}">${a.icon}</th>`).join("")}<th>⭐</th><th>⏱️</th><th style="text-align:left">Nota</th></tr>`;
  const rows = dates.map(d => {
    const rec = DATA.records[d];
    const cells = ALL_ACTIVITIES.map(a => {
      if (a.weekdaysOnly && isWeekend(d)) return "<td>—</td>";
      if (rec[a.id]?.done) return `<td style="color:var(--green);font-weight:900">✔</td>`;
      // Día ya terminado sin cumplir la actividad → ✘ · Hoy (aún en curso) → punto neutro
      if (d < today) return `<td style="color:#e85a6e;font-weight:900">✘</td>`;
      return "<td>·</td>";
    }).join("");
    return `<tr>
      <td style="text-align:left"><b>${d}</b></td>${cells}
      <td><b>${starsForDay(DATA, d)}</b></td>
      <td>${minutesForDay(DATA, d) || "—"}</td>
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

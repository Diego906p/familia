// ===== Capa de datos =====
// Base: data/data.json (en el repo). Cambios del admin: localStorage.
// El admin exporta data.json actualizado y lo sube al repositorio.

const STORAGE_KEY = "luanna_data";

const ALL_ACTIVITIES = [...CONFIG.activities.responsibilities, ...CONFIG.activities.learning];

async function loadData() {
  let base = { meta: {}, messages: [], records: {}, readings: [], mathTopics: [] };
  try {
    const res = await fetch("data/data.json", { cache: "no-store" });
    if (res.ok) base = await res.json();
  } catch (e) {
    console.warn("No se pudo cargar data/data.json, usando datos locales.", e);
  }
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw) {
    try {
      const local = JSON.parse(localRaw);
      // Si la copia local es más reciente, prevalece.
      if ((local.meta?.savedAt || 0) >= (Date.parse(base.meta?.lastUpdate || 0) || 0)) {
        return local;
      }
    } catch { /* ignorar copia local corrupta */ }
  }
  return base;
}

function saveData(data) {
  data.meta = data.meta || {};
  data.meta.savedAt = Date.now();
  data.meta.lastUpdate = todayStr();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== Utilidades de fechas =====

function todayStr() {
  return dateToStr(new Date());
}

function dateToStr(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function strToDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isWeekend(dateStr) {
  const day = strToDate(dateStr).getDay();
  return day === 0 || day === 6;
}

// Lunes de la semana que contiene la fecha dada
function mondayOf(d) {
  const date = new Date(d);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return dateToStr(d);
  });
}

// ===== Cálculos =====

function activitiesForDay(dateStr) {
  return isWeekend(dateStr)
    ? CONFIG.activities.responsibilities
    : ALL_ACTIVITIES;
}

function starsForDay(data, dateStr) {
  const rec = data.records[dateStr];
  if (!rec) return 0;
  return activitiesForDay(dateStr).reduce(
    (sum, a) => sum + (rec[a.id]?.done ? a.stars : 0), 0);
}

function isDayComplete(data, dateStr) {
  const rec = data.records[dateStr];
  if (!rec) return false;
  return activitiesForDay(dateStr).every(a => rec[a.id]?.done);
}

function minutesForDay(data, dateStr) {
  const rec = data.records[dateStr];
  if (!rec) return 0;
  return ALL_ACTIVITIES.reduce((sum, a) => sum + (rec[a.id]?.minutes || 0), 0);
}

function computeStats(data) {
  const dates = Object.keys(data.records).sort();
  let totalStars = 0, fullDays = 0, beds = 0, mathDays = 0;
  for (const d of dates) {
    totalStars += starsForDay(data, d);
    if (isDayComplete(data, d)) fullDays++;
    if (data.records[d].make_bed?.done) beds++;
    if (data.records[d].math?.done) mathDays++;
  }

  // Rachas (días consecutivos completos, terminando hoy o ayer)
  let currentStreak = 0, bestStreak = 0, run = 0, prev = null;
  for (const d of dates) {
    if (isDayComplete(data, d)) {
      if (prev) {
        const diff = (strToDate(d) - strToDate(prev)) / 86400000;
        run = diff === 1 ? run + 1 : 1;
      } else run = 1;
      prev = d;
      bestStreak = Math.max(bestStreak, run);
    }
  }
  if (prev) {
    const gap = (strToDate(todayStr()) - strToDate(prev)) / 86400000;
    if (gap <= 1) currentStreak = run;
  }

  // Semanas perfectas
  let perfectWeeks = 0;
  const weeks = new Set(dates.map(d => dateToStr(mondayOf(strToDate(d)))));
  for (const mon of weeks) {
    const days = weekDates(strToDate(mon));
    if (days.every(d => isDayComplete(data, d))) perfectWeeks++;
  }

  const stats = {
    totalStars, fullDays, beds, mathDays, currentStreak, bestStreak, perfectWeeks,
    readings: (data.readings || []).length,
    daysRecorded: dates.length
  };

  // Nivel
  let level = CONFIG.levels[0], next = null;
  for (const l of CONFIG.levels) {
    if (totalStars >= l.min) level = l; else { next = l; break; }
  }
  stats.level = level;
  stats.nextLevel = next;
  stats.levelProgress = next
    ? Math.round(((totalStars - level.min) / (next.min - level.min)) * 100)
    : 100;

  stats.achievements = CONFIG.achievements.map(a => ({ ...a, unlocked: a.check(stats) }));
  return stats;
}

function getActivity(id) {
  return ALL_ACTIVITIES.find(a => a.id === id);
}

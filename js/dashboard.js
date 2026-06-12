// ===== Dashboard v2 — réplica de propuesta3.png =====

const session = requireAuth(["child", "admin"]);
let DATA = null;
let currentMonday = mondayOf(new Date());

const ACT_ICONS = {
  make_bed: "act_bed",
  organize_room: "act_room",
  wash_utensils: "act_dishes",
  brush_teeth: "act_teeth",
  reading: "act_reading",
  reading_summary: "act_summary",
  math: "act_math"
};

// Progreso de la semana actual (hasta hoy)
function weekProgress() {
  const days = weekDates(mondayOf(new Date()));
  const today = todayStr();
  const pastDays = days.filter(d => d <= today);
  const got = pastDays.reduce((sum, d) => sum + starsForDay(DATA, d), 0);
  const possible = pastDays.reduce((sum, d) =>
    sum + (isWeekend(d) ? CONFIG.dailyMax.weekend : CONFIG.dailyMax.weekday), 0);
  return { got, possible, pct: possible ? Math.round((got / possible) * 100) : 0 };
}

(async function init() {
  if (!session) return;
  if (session.role === "admin") document.getElementById("adminLink").style.display = "";
  DATA = await loadData();
  applyMoods(computeStats(DATA).currentStreak, weekProgress().pct);
  renderStatic();
  renderKpis();
  renderWeek();
  renderProgress();
  renderAchievements();
  document.getElementById("lastUpdate").textContent =
    "Actualizado: " + (DATA.meta?.lastUpdate || todayStr());
})();

// Imágenes fijas del layout
function renderStatic() {
  document.getElementById("avatarSlot").innerHTML = imgOrPlaceholder("avatar_luanna", "round");
  document.getElementById("kpiStarsImg").innerHTML = imgOrPlaceholder("star_happy");
  document.getElementById("kpiLevelImg").innerHTML = imgOrPlaceholder("star_level");
  document.getElementById("kpiFlameImg").innerHTML = imgOrPlaceholder("flame_streak");
  document.getElementById("trophySlot").innerHTML = imgOrPlaceholder("trophy");
  document.getElementById("houseSlot").innerHTML = imgOrPlaceholder("house_progress");
  document.getElementById("booksSlot").innerHTML = imgOrPlaceholder("books_progress");
  document.getElementById("catSlot").innerHTML = imgOrPlaceholder("cat_streak");
  document.getElementById("gardenCharSlot").innerHTML = imgOrPlaceholder("garden_character");
  document.getElementById("gardenCastleSlot").innerHTML = imgOrPlaceholder("garden_castle");
  document.getElementById("footerStarSlot").innerHTML = imgOrPlaceholder("footer_star");
  // Iconos de títulos de sección y detalles
  document.getElementById("calBandSlot").innerHTML = imgOrPlaceholder("cal_band");
  document.getElementById("calFooterSlot").innerHTML = imgOrPlaceholder("cal_footer");
  document.getElementById("progressIconSlot").innerHTML = imgOrPlaceholder("my_progress");
  document.getElementById("medalIconSlot").innerHTML = imgOrPlaceholder("ach_medal");
  document.getElementById("lockIconSlot").innerHTML = imgOrPlaceholder("lock_soon");
  document.getElementById("heartHelloSlot").innerHTML = imgOrPlaceholder("heart_lilac");
}

// Mensajes motivadores por nivel (1 Excelente · 2 En progreso · 3 Necesita ayuda)
const LEVEL_MSGS = {
  stars: {
    1: "¡Sigue así,<br>vas increíble! 💜",
    2: "¡Vas muy bien,<br>no te detengas! 💜",
    3: "¡Hoy puedes recuperar<br>tus estrellas! 💪"
  },
  level: {
    1: "¡Vas súper bien! 💜",
    2: "¡Sigue avanzando! 💜",
    3: "¡Tú puedes subir! 💪"
  },
  streakKpi: {
    1: "¡No la rompas! 💗",
    2: "¡Va creciendo! 💗",
    3: "¡Hoy puedes empezar<br>una nueva! 💪"
  },
  streakCard: {
    1: "¡Vamos por más! 💗",
    2: "¡Vamos bien, sigue así! 💗",
    3: "¡Tú puedes volver a empezar! 💪"
  }
};

function renderKpis() {
  const s = computeStats(DATA);
  const lvlWeek = levelForPct(weekProgress().pct);
  const lvlStreak = levelForStreak(s.currentStreak);

  document.getElementById("kpiStarsValue").textContent = s.totalStars;
  document.getElementById("kpiStarsMsg").innerHTML = LEVEL_MSGS.stars[lvlWeek];
  document.getElementById("kpiLevelMsg").innerHTML = LEVEL_MSGS.level[lvlWeek];
  document.getElementById("kpiStreakMsg").innerHTML = LEVEL_MSGS.streakKpi[lvlStreak];
  document.getElementById("streakCardMsg").innerHTML = LEVEL_MSGS.streakCard[lvlStreak];

  document.getElementById("kpiLevelName").innerHTML =
    s.level.name.replace(" ", "<br>");
  document.getElementById("kpiLevelN").textContent = "Nivel " + s.level.level;
  document.getElementById("kpiLevelBar").style.width = s.levelProgress + "%";
  document.getElementById("kpiLevelPct").textContent = s.levelProgress + "%";

  document.getElementById("kpiStreakValue").textContent = s.currentStreak;

  // Progreso general: estrellas de la semana actual vs máximo
  const { got, possible, pct } = weekProgress();

  const arc = document.getElementById("donutArc");
  const circ = 2 * Math.PI * 46;
  arc.setAttribute("stroke-dasharray", `${(pct / 100) * circ} ${circ}`);
  document.getElementById("donutPct").textContent = pct + "%";
  document.getElementById("kpiPoints").textContent = `${got} / ${possible}`;
}

function renderWeek() {
  const days = weekDates(currentMonday);
  const today = todayStr();
  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const dd = s => { const d = strToDate(s); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
  const fmt = d => strToDate(d).getDate();
  document.getElementById("weekLabel").textContent =
    `Semana del ${fmt(days[0])} al ${fmt(days[6])} de ${strToDate(days[6]).toLocaleDateString("es", { month: "long" })}`;

  const starImg = (size = 16) =>
    `<img src="${IMAGES.star_level.url}" width="${size}" height="${size}" alt="estrella" class="star-ico">`;

  const rowsFor = (acts, color) => acts.map(a => {
    let earned = 0;
    const cells = days.map((d, i) => {
      if (a.weekdaysOnly && i >= 5) return `<td class="cell-na">—</td>`;
      const rec = DATA.records[d]?.[a.id];
      // Tres estados: ✔ realizado · ✘ marcado como no realizado · vacío = sin información
      if (rec?.done === true) { earned += a.stars; return `<td><span class="chk ${color}">✔</span></td>`; }
      if (rec?.done === false) return `<td><span class="chk red"><svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span></td>`;
      return `<td><span class="chk empty"></span></td>`;
    }).join("");
    const nDays = a.weekdaysOnly ? 5 : 7;
    return `<tr>
      <td class="act-name">${imgOrPlaceholder(ACT_ICONS[a.id])}<span class="act-info">
        <span>${a.name}</span>
        <small class="act-val">${starImg(12)} ${a.stars} por día</small>
      </span></td>
      ${cells}
      <td class="stars-cell">${earned} ${starImg(18)} <small>/ ${a.stars * nDays}</small></td>
    </tr>`;
  }).join("");

  const totalsCells = days.map(d => {
    const st = starsForDay(DATA, d);
    return `<td class="big">${st ? st + " " + starImg(18) : ""}</td>`;
  }).join("");
  const weekTotal = days.reduce((sum, d) => sum + starsForDay(DATA, d), 0);

  document.getElementById("weekMatrix").innerHTML = `
    <tr>
      <th style="text-align:left;padding-left:16px">Actividad</th>
      ${dayNames.map((n, i) => `<th class="${days[i] === today ? "today-col" : ""}">${n}<span class="date-sub">${dd(days[i])}</span></th>`).join("")}
      <th>Estrellas<br>de la semana</th>
    </tr>
    <tr class="group-row resp"><td colspan="9">${imgOrPlaceholder("house_chores")} RESPONSABILIDADES</td></tr>
    ${rowsFor(CONFIG.activities.responsibilities, "green")}
    <tr class="group-row learn"><td colspan="9">${imgOrPlaceholder("learning_c")} APRENDIZAJE <small>(Lunes a Viernes)</small></td></tr>
    ${rowsFor(CONFIG.activities.learning, "purple")}
    <tr class="totals-row">
      <td>Estrellas por día</td>${totalsCells}
      <td class="big">${weekTotal} ${starImg(20)} <small>/ ${CONFIG.weeklyMax}</small></td>
    </tr>`;
}

document.getElementById("prevWeek").onclick = () => { currentMonday.setDate(currentMonday.getDate() - 7); renderWeek(); };
document.getElementById("nextWeek").onclick = () => { currentMonday.setDate(currentMonday.getDate() + 7); renderWeek(); };

function renderProgress() {
  const days = weekDates(mondayOf(new Date()));
  const today = todayStr();
  const pastDays = days.filter(d => d <= today);

  const pctFor = (acts) => {
    let done = 0, total = 0;
    for (const d of pastDays) {
      for (const a of acts) {
        if (a.weekdaysOnly && isWeekend(d)) continue;
        total++;
        if (DATA.records[d]?.[a.id]?.done) done++;
      }
    }
    return total ? Math.round((done / total) * 100) : 0;
  };
  const praise = p => {
    const lvl = levelForPct(p);
    return lvl === 1 ? "¡Excelente trabajo! 🎉" : lvl === 2 ? "¡Vas muy bien, sigue así! 👏" : "¡Tú puedes lograrlo! 💪";
  };

  const r = pctFor(CONFIG.activities.responsibilities);
  const l = pctFor(CONFIG.activities.learning);
  document.getElementById("respBar").style.width = r + "%";
  document.getElementById("respPct").textContent = r + "%";
  document.getElementById("respMsg").textContent = praise(r);
  document.getElementById("learnBar").style.width = l + "%";
  document.getElementById("learnPct").textContent = l + "%";
  document.getElementById("learnMsg").textContent = praise(l);

  const s = computeStats(DATA);
  document.getElementById("streakRing").textContent = s.currentStreak;
}

function renderAchievements() {
  const s = computeStats(DATA);
  // Los 5 logros destacados del diseño; el resto se mantiene en la versión 1
  const featured = [
    { key: "ach_streak", id: "streak_7", label: "7 días seguidos" },
    { key: "ach_reading", id: "reading_10", label: "Lecturas completadas" },
    { key: "ach_week", id: "first_week", label: "Semana perfecta" },
    { key: "ach_summary", id: "first_day", label: "Primer día completo" },
    { key: "ach_math", id: "math_100", label: "Ejercicios de matemáticas" }
  ];
  document.getElementById("achGrid").innerHTML = featured.map(f => {
    const a = s.achievements.find(x => x.id === f.id);
    return `<div class="ach-item ${a?.unlocked ? "" : "locked"}">
      ${imgOrPlaceholder(f.key, "round")}
      <div class="label">${f.label}</div>
    </div>`;
  }).join("");
}

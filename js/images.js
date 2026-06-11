// ===== Manifiesto de imágenes del diseño v2 (vinculado a /img) =====
// Las claves con "variants" cambian según el ánimo/desempeño:
//   star_happy, flame_streak, cat_streak, avatar_luanna → 1 feliz · 2 neutral · 3 triste
//   trophy → 1 oro · 2 plata · 3 bronce
// applyMoods() (llamada desde dashboard.js) elige la variante correcta.

const USE_SVG_FALLBACK = false;

// Servir imágenes desde el repositorio de GitHub (true) o la carpeta local img/ (false)
const USE_REMOTE_IMAGES = true;
const IMG_BASE = "https://raw.githubusercontent.com/Diego906p/imagenes/main/images/";

const IMAGES = {
  // --- Con variantes de ánimo ---
  avatar_luanna: { url: "img/avatar_luanna1.png", variants: "img/avatar_luanna{n}.png", w: 200, h: 193, desc: "Avatar de Luanna" },
  avatar_papa:   { url: "img/avatar_papa1.png",   variants: "img/avatar_papa{n}.png",   w: 76,  h: 73,  desc: "Avatar de papá: 1 contento · 2 molesto · 3 triste" },
  star_happy:    { url: "img/star_happy1.png",    variants: "img/star_happy{n}.png",    w: 80,  h: 80,  desc: "Estrella con carita (KPI estrellas)" },
  flame_streak:  { url: "img/flame_streak1.png",  variants: "img/flame_streak{n}.png",  w: 72,  h: 72,  desc: "Llama de racha (3 = hielo, racha rota)" },
  cat_streak:    { url: "img/cat_streak1.png",    variants: "img/cat_streak{n}.png",    w: 175, h: 154, desc: "Gatita de la racha" },
  trophy:        { url: "img/trophy1.png",        variants: "img/trophy{n}.png",        w: 101, h: 120, desc: "Trofeo oro/plata/bronce según la semana" },

  // --- Fijas ---
  star_level:       { url: "img/star_level.png",       w: 72,  h: 72,  desc: "Estrella del nivel" },
  act_bed:          { url: "img/act_bed.png",          w: 48,  h: 43,  desc: "Tender mi cama" },
  act_room:         { url: "img/act_room.png",         w: 48,  h: 43,  desc: "Ordenar mi cuarto" },
  act_dishes:       { url: "img/act_dishes.png",       w: 48,  h: 43,  desc: "Lavar mis utensilios" },
  act_teeth:        { url: "img/act_teeth.png",        w: 48,  h: 43,  desc: "Cepillarme los dientes" },
  act_reading:      { url: "img/act_reading.png",      w: 48,  h: 48,  desc: "Lectura" },
  act_summary:      { url: "img/act_summary.png",      w: 48,  h: 48,  desc: "Resumen de lectura" },
  act_math:         { url: "img/act_math.png",         w: 48,  h: 46,  desc: "Matemáticas" },
  house_progress:   { url: "img/house_progress.png",   w: 78,  h: 47,  desc: "Casita decorativa (progreso)" },
  books_progress:   { url: "img/books_progress.png",   w: 64,  h: 50,  desc: "Libros decorativos (progreso)" },
  ach_streak:       { url: "img/ach_streak.png",       w: 84,  h: 84,  desc: "Logro: 7 días seguidos" },
  ach_reading:      { url: "img/ach_reading.png",      w: 84,  h: 84,  desc: "Logro: lecturas completadas" },
  ach_week:         { url: "img/ach_week.png",         w: 84,  h: 84,  desc: "Logro: semana perfecta" },
  ach_summary:      { url: "img/ach_summary.png",      w: 84,  h: 84,  desc: "Logro: resúmenes hechos" },
  ach_math:         { url: "img/ach_math.png",         w: 84,  h: 84,  desc: "Logro: ejercicios de matemáticas" },
  garden_character: { url: "img/garden_character.png", w: 96,  h: 96,  desc: "Personaje del jardín (Próximamente)" },
  garden_castle:    { url: "img/garden_castle.png",    w: 170, h: 134, desc: "Castillo del jardín (Próximamente)" },
  footer_star:      { url: "img/footer_star.png",      w: 56,  h: 56,  desc: "Estrella del footer" },

  // --- Iconos de títulos de sección y detalles ---
  cal_band:      { url: "img/calendar_1.png",      w: 30, h: 33, desc: "Calendario (banda 'Actividades de la semana')" },
  cal_footer:    { url: "img/calendar_2.png",      w: 26, h: 27, desc: "Calendario (footer 'Actualizado')" },
  house_chores:  { url: "img/house_chores.png",    w: 30, h: 30, desc: "Casita 3D (grupo Responsabilidades)" },
  learning_c:    { url: "img/learning_c.png",      w: 30, h: 30, desc: "Cerebro (grupo Aprendizaje)" },
  my_progress:   { url: "img/my_progress.png",     w: 30, h: 29, desc: "Gráfico (título Mi progreso general)" },
  ach_medal:     { url: "img/ac_medal.png",        w: 26, h: 32, desc: "Medalla (título Logros especiales)" },
  lock_soon:     { url: "img/locked_padlock.png",  w: 23, h: 32, desc: "Candado gris (título Próximamente)" },
  lock_gold:     { url: "img/locked_gold.png",     w: 23, h: 32, desc: "Candado dorado (reserva, jardín desbloqueado)" },
  heart_lilac:   { url: "img/heart_lilac.png",     w: 22, h: 21, desc: "Corazón lila (frases)" },
  heart_red:     { url: "img/heart_redc.png",      w: 22, h: 21, desc: "Corazón rojo/rosa (racha)" }
};

// Reemplaza el prefijo local img/ por la URL remota
if (USE_REMOTE_IMAGES) {
  for (const k in IMAGES) {
    if (IMAGES[k].url) IMAGES[k].url = IMAGES[k].url.replace(/^img\//, IMG_BASE);
    if (IMAGES[k].variants) IMAGES[k].variants = IMAGES[k].variants.replace(/^img\//, IMG_BASE);
  }
}

// ===== Sistema único de 3 niveles =====
// Nivel 1: Excelente (80-100%) · Nivel 2: En progreso (50-79%) · Nivel 3: Necesita ayuda (0-49%)
const LEVELS3 = [
  { n: 1, name: "Excelente", icon: "⭐" },
  { n: 2, name: "En progreso", icon: "😊" },
  { n: 3, name: "Necesita ayuda", icon: "😔" }
];

function levelForPct(pct) {
  return pct >= 80 ? 1 : pct >= 50 ? 2 : 3;
}

// Racha en niveles: 3+ días = Excelente, 1-2 = En progreso, 0 = Necesita ayuda
function levelForStreak(streak) {
  return streak >= 3 ? 1 : streak >= 1 ? 2 : 3;
}

// Elige variantes según desempeño. streak = racha actual, weekPct = % de la semana.
function applyMoods(streak, weekPct) {
  const lvlWeek = levelForPct(weekPct);     // avatar, estrella y copa
  const lvlStreak = levelForStreak(streak); // fueguito y Kuromi
  const set = (key, n) => { IMAGES[key].url = IMAGES[key].variants.replace("{n}", n); };
  set("avatar_luanna", lvlWeek);
  set("avatar_papa", lvlWeek);   // 1 contento · 2 molesto · 3 triste
  set("star_happy", lvlWeek);
  set("trophy", lvlWeek);
  set("flame_streak", lvlStreak);
  set("cat_streak", lvlStreak);
}

// Devuelve <img> si hay URL; si no, SVG integrado (si está activo) o placeholder.
function imgOrPlaceholder(key, extraClass = "") {
  const im = IMAGES[key];
  if (!im) return "";
  if (im.url) {
    return `<img src="${im.url}" width="${im.w}" height="${im.h}" alt="${key}" class="png ${extraClass}" loading="lazy">`;
  }
  if (USE_SVG_FALLBACK && typeof SVGS !== "undefined" && SVGS[key]) {
    return svgFor(key, im, extraClass);
  }
  return `<div class="img-ph ${extraClass}" style="width:${im.w}px;height:${im.h}px" title="${im.desc}">
    <span class="ph-name">${key}.png</span>
    <span class="ph-size">${im.w}×${im.h}</span>
  </div>`;
}

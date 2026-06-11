// ===== Ilustraciones SVG integradas (diseño v3) =====
// Reemplazan a los PNG mientras IMAGES[key].url sea null.
// Si luego se asigna una URL en images.js, el PNG tiene prioridad.

const SVGS = {};

(function build() {

  // --- Piezas reutilizables ---
  const face = (cx, cy, s = 1) => `
    <circle cx="${cx - 8 * s}" cy="${cy}" r="${3.4 * s}" fill="#5b3b1e"/>
    <circle cx="${cx + 8 * s}" cy="${cy}" r="${3.4 * s}" fill="#5b3b1e"/>
    <path d="M${cx - 7 * s} ${cy + 8 * s} Q${cx} ${cy + 14 * s} ${cx + 7 * s} ${cy + 8 * s}"
      stroke="#5b3b1e" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - 16 * s}" cy="${cy + 7 * s}" r="${4 * s}" fill="#ff9eb5" opacity=".65"/>
    <circle cx="${cx + 16 * s}" cy="${cy + 7 * s}" r="${4 * s}" fill="#ff9eb5" opacity=".65"/>`;

  const starShape = `<polygon points="50,4 62,36 96,36 68,57 79,91 50,70 21,91 32,57 4,36 38,36"
    fill="#ffc83d" stroke="#f0a32a" stroke-width="5" stroke-linejoin="round"/>`;

  const sparkle = (x, y, r) => `<path d="M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y}
    L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y}
    L${x - r * .3} ${y - r * .3} Z" fill="#fff" stroke="#f0a32a" stroke-width="1.5"/>`;

  // --- Estrellas ---
  SVGS.star_happy = { vb: "0 0 100 100", body: starShape + face(50, 50) };
  SVGS.star_level = { vb: "0 0 100 100", body: starShape + face(50, 50) + sparkle(86, 14, 9) + sparkle(12, 18, 6) };
  SVGS.footer_star = { vb: "0 0 100 100", body: starShape + face(50, 50) };

  // --- Llama (racha) ---
  SVGS.flame_streak = {
    vb: "0 0 100 100",
    body: `
    <path d="M50 4 C58 22 79 36 79 61 a29 29 0 0 1 -58 0 C21 40 41 26 50 4 Z"
      fill="#ff7a3d" stroke="#f25c1f" stroke-width="3"/>
    <path d="M50 32 C55 43 67 50 67 63 a17 17 0 0 1 -34 0 C33 52 45 45 50 32 Z" fill="#ffc83d"/>
    <circle cx="43" cy="62" r="3" fill="#5b3b1e"/>
    <circle cx="57" cy="62" r="3" fill="#5b3b1e"/>
    <path d="M44 70 Q50 75 56 70" stroke="#5b3b1e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
  };

  // --- Iconos de actividades (48px) ---
  SVGS.act_bed = {
    vb: "0 0 100 100",
    body: `
    <rect x="8" y="26" width="11" height="46" rx="5" fill="#8a5a36"/>
    <rect x="81" y="40" width="11" height="32" rx="5" fill="#8a5a36"/>
    <rect x="15" y="52" width="70" height="14" rx="6" fill="#f5ead9" stroke="#e0d0b8" stroke-width="2"/>
    <path d="M38 52 h47 v14 h-47 z" fill="#4d9fff"/>
    <path d="M38 52 h47 v5 h-47 z" fill="#3b86e0"/>
    <ellipse cx="28" cy="48" rx="11" ry="7" fill="#fff" stroke="#ddd2c2" stroke-width="2"/>
    <rect x="14" y="66" width="6" height="10" fill="#8a5a36"/>
    <rect x="80" y="66" width="6" height="10" fill="#8a5a36"/>`
  };

  SVGS.act_room = {
    vb: "0 0 100 100",
    body: `
    <rect x="16" y="38" width="68" height="44" rx="6" fill="#b07b52" stroke="#8a5a36" stroke-width="3"/>
    <line x1="16" y1="53" x2="84" y2="53" stroke="#8a5a36" stroke-width="3"/>
    <line x1="16" y1="68" x2="84" y2="68" stroke="#8a5a36" stroke-width="3"/>
    <circle cx="50" cy="46" r="3" fill="#5e3d22"/>
    <circle cx="50" cy="61" r="3" fill="#5e3d22"/>
    <circle cx="50" cy="75" r="3" fill="#5e3d22"/>
    <path d="M42 24 h16 l-2.5 14 h-11 Z" fill="#e2725b" stroke="#c75a45" stroke-width="2"/>
    <circle cx="43" cy="18" r="6" fill="#3fb56e"/>
    <circle cx="51" cy="13" r="7" fill="#5ecb87"/>
    <circle cx="58" cy="19" r="6" fill="#3fb56e"/>`
  };

  SVGS.act_dishes = {
    vb: "0 0 100 100",
    body: `
    <circle cx="58" cy="52" r="29" fill="#cfe4ff" stroke="#4d9fff" stroke-width="4"/>
    <circle cx="58" cy="52" r="15" fill="#eaf4ff"/>
    <path d="M16 20 v16 M11 20 v10 M21 20 v10" stroke="#8a5a36" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M16 36 v44" stroke="#8a5a36" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="88" cy="28" rx="6" ry="9" fill="#8a5a36"/>
    <path d="M88 37 v43" stroke="#8a5a36" stroke-width="4" stroke-linecap="round"/>`
  };

  SVGS.act_teeth = {
    vb: "0 0 100 100",
    body: `
    <rect x="8" y="56" width="52" height="12" rx="6" fill="#7c5cff"/>
    <rect x="58" y="50" width="28" height="18" rx="5" fill="#fff" stroke="#cfc6ea" stroke-width="2.5"/>
    <path d="M62 50 v-8 M68 50 v-8 M74 50 v-8 M80 50 v-8" stroke="#e8e2f8" stroke-width="4" stroke-linecap="round"/>
    <path d="M60 36 q6 -8 12 0 q6 6 14 1" stroke="#3fc9b0" stroke-width="7" fill="none" stroke-linecap="round"/>`
  };

  SVGS.act_reading = {
    vb: "0 0 100 100",
    body: `
    <path d="M50 34 C37 25 20 26 12 32 V78 C20 72 37 72 50 80 Z" fill="#8a63ff" stroke="#6a4fd8" stroke-width="3"/>
    <path d="M50 34 C63 25 80 26 88 32 V78 C80 72 63 72 50 80 Z" fill="#a585ff" stroke="#6a4fd8" stroke-width="3"/>
    <path d="M20 40 q14 -3 24 2 M20 50 q14 -3 24 2 M56 42 q14 -5 24 -2 M56 52 q14 -5 24 -2"
      stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".7" stroke-linecap="round"/>
    <polygon points="50,6 54,16 65,16 56,23 59,33 50,27 41,33 44,23 35,16 46,16"
      fill="#ffc83d" stroke="#f0a32a" stroke-width="2" stroke-linejoin="round"/>`
  };

  SVGS.act_summary = {
    vb: "0 0 100 100",
    body: `
    <rect x="20" y="12" width="52" height="70" rx="6" fill="#fff" stroke="#d8cfee" stroke-width="3"/>
    <line x1="29" y1="28" x2="63" y2="28" stroke="#b9a9e8" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="29" y1="40" x2="63" y2="40" stroke="#b9a9e8" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="29" y1="52" x2="55" y2="52" stroke="#b9a9e8" stroke-width="3.5" stroke-linecap="round"/>
    <g transform="rotate(45 72 62)">
      <rect x="64" y="38" width="14" height="40" rx="3" fill="#ff9a3d" stroke="#e07f24" stroke-width="2"/>
      <polygon points="64,78 78,78 71,92" fill="#f5d9b8" stroke="#e07f24" stroke-width="2"/>
      <polygon points="68.5,85 73.5,85 71,92" fill="#5b3b1e"/>
    </g>`
  };

  const mathSq = (x, y, c, sym) => {
    let s = "";
    const cx = x + 15, cy = y + 15;
    if (sym === "+") s = `<path d="M${cx - 7} ${cy} h14 M${cx} ${cy - 7} v14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
    if (sym === "-") s = `<path d="M${cx - 7} ${cy} h14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
    if (sym === "x") s = `<path d="M${cx - 6} ${cy - 6} l12 12 M${cx + 6} ${cy - 6} l-12 12" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
    if (sym === "=") s = `<path d="M${cx - 7} ${cy - 4} h14 M${cx - 7} ${cy + 4} h14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
    return `<rect x="${x}" y="${y}" width="30" height="30" rx="8" fill="${c}"/>` + s;
  };

  SVGS.act_math = {
    vb: "0 0 100 100",
    body: mathSq(17, 17, "#2eb872", "+") + mathSq(53, 17, "#7c5cff", "-") +
          mathSq(17, 53, "#7c5cff", "x") + mathSq(53, 53, "#2eb872", "=")
  };

  // --- Trofeo ---
  SVGS.trophy = {
    vb: "0 0 100 100",
    body: `
    <circle cx="14" cy="22" r="3.5" fill="#ff4f9a"/>
    <circle cx="88" cy="16" r="3" fill="#7c5cff"/>
    <circle cx="90" cy="48" r="3" fill="#ffc83d"/>
    <circle cx="10" cy="52" r="2.5" fill="#7c5cff"/>
    <rect x="80" y="30" width="5" height="5" rx="1" fill="#ff4f9a" transform="rotate(20 82 32)"/>
    <rect x="14" y="36" width="5" height="5" rx="1" fill="#ffc83d" transform="rotate(-15 16 38)"/>
    <path d="M29 14 H17 a14 16 0 0 0 16 21" fill="none" stroke="#e8a020" stroke-width="5"/>
    <path d="M71 14 H83 a14 16 0 0 1 -16 21" fill="none" stroke="#e8a020" stroke-width="5"/>
    <path d="M29 10 h42 v22 a21 21 0 0 1 -42 0 Z" fill="#ffc83d" stroke="#e8a020" stroke-width="3.5"/>
    <polygon points="50,18 53.5,26 62,26 55.5,31.5 58,40 50,35 42,40 44.5,31.5 38,26 46.5,26"
      fill="#fff" stroke="#e8a020" stroke-width="2" stroke-linejoin="round"/>
    <rect x="44" y="52" width="12" height="11" fill="#e8a020"/>
    <rect x="33" y="63" width="34" height="10" rx="3" fill="#e8a020"/>
    <rect x="27" y="73" width="46" height="10" rx="4" fill="#c9851a"/>`
  };

  // --- Decoraciones de progreso ---
  SVGS.house_progress = {
    vb: "0 0 90 70",
    body: `
    <ellipse cx="20" cy="14" rx="13" ry="7" fill="#e3ecfb"/>
    <ellipse cx="33" cy="11" rx="9" ry="5" fill="#eef3fc"/>
    <rect x="20" y="38" width="32" height="26" rx="3" fill="#fde9d2" stroke="#e8b985" stroke-width="2"/>
    <polygon points="16,40 36,22 56,40" fill="#e2725b" stroke="#c75a45" stroke-width="2" stroke-linejoin="round"/>
    <rect x="31" y="48" width="10" height="16" rx="2" fill="#8a5a36"/>
    <circle cx="72" cy="38" r="11" fill="#5ecb87"/>
    <circle cx="66" cy="46" r="9" fill="#3fb56e"/>
    <circle cx="78" cy="46" r="9" fill="#3fb56e"/>
    <rect x="69" y="50" width="6" height="14" fill="#8a5a36"/>
    <path d="M8 64 H86" stroke="#bfe3cd" stroke-width="4" stroke-linecap="round"/>`
  };

  SVGS.books_progress = {
    vb: "0 0 80 70",
    body: `
    <rect x="10" y="52" width="60" height="13" rx="3" fill="#2eb872" stroke="#249459" stroke-width="2"/>
    <rect x="14" y="39" width="54" height="13" rx="3" fill="#7c5cff" stroke="#5f43d6" stroke-width="2"/>
    <rect x="18" y="26" width="48" height="13" rx="3" fill="#ff4f9a" stroke="#d63a80" stroke-width="2"/>
    <g transform="rotate(-8 42 18)">
      <rect x="22" y="12" width="42" height="12" rx="3" fill="#ffc83d" stroke="#e8a020" stroke-width="2"/>
    </g>
    <line x1="18" y1="58" x2="62" y2="58" stroke="#fff" stroke-width="2" opacity=".5"/>
    <line x1="22" y1="45" x2="58" y2="45" stroke="#fff" stroke-width="2" opacity=".5"/>`
  };

  // --- Medallones de logros (círculo de color + mini icono) ---
  const medal = (color, inner) => `
    <circle cx="50" cy="50" r="47" fill="${color}"/>
    <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="4"/>
    ${inner}`;

  SVGS.ach_streak = {
    vb: "0 0 100 100",
    body: medal("#cfe4ff", `
      <rect x="28" y="30" width="44" height="42" rx="6" fill="#fff" stroke="#9db9e8" stroke-width="2.5"/>
      <rect x="28" y="30" width="44" height="12" rx="6" fill="#4d9fff"/>
      <rect x="35" y="24" width="5" height="10" rx="2.5" fill="#3b86e0"/>
      <rect x="60" y="24" width="5" height="10" rx="2.5" fill="#3b86e0"/>
      <path d="M50 66 C44 60 38 56 38 51 a6 6 0 0 1 12 -2 a6 6 0 0 1 12 2 C62 56 56 60 50 66 Z" fill="#ff4f5e"/>`)
  };

  SVGS.ach_reading = {
    vb: "0 0 100 100",
    body: medal("#ffe3cf", `<g transform="translate(22,24) scale(0.56)">${SVGS.act_reading.body}</g>`)
  };

  SVGS.ach_week = {
    vb: "0 0 100 100",
    body: medal("#fff1c4", `<g transform="translate(24,22) scale(0.55)">${SVGS.trophy.body}</g>`)
  };

  SVGS.ach_summary = {
    vb: "0 0 100 100",
    body: medal("#e7ddff", `<g transform="translate(22,22) scale(0.56)">${SVGS.act_summary.body}</g>`)
  };

  SVGS.ach_math = {
    vb: "0 0 100 100",
    body: medal("#dcf5e6", `<g transform="translate(22,22) scale(0.56)">${SVGS.act_math.body}</g>`)
  };
})();

function svgFor(key, im, extraClass = "") {
  const s = SVGS[key];
  return `<svg width="${im.w}" height="${im.h}" viewBox="${s.vb}" xmlns="http://www.w3.org/2000/svg"
    class="png svg ${extraClass}" role="img" aria-label="${key}">${s.body}</svg>`;
}

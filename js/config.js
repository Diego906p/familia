// ===== Configuración general del Panel de Progreso de Luanna =====

const CONFIG = {
  appName: "Panel de Progreso de Luanna",
  // Credenciales (hash SHA-256 de las contraseñas).
  // admin  -> contraseña: "papa2026"
  // luanna -> contraseña: "estrella"
  users: {
    admin: {
      role: "admin",
      passwordHash: "42dcf15002a7a5cb4fe7919d4f726a657cc7133a479db6363c4c26b183e8e9b0"
    },
    luanna: {
      role: "child",
      passwordHash: "d9078313c20e82941879e10262ab7a761f29a61e835f9a76a742f3f914cea941"
    }
  },
  activities: {
    responsibilities: [
      { id: "make_bed", name: "Tender mi cama", short: "Cama", icon: "🛏️", stars: 1 },
      { id: "organize_room", name: "Ordenar mi cuarto", short: "Cuarto", icon: "🧸", stars: 1 },
      { id: "wash_utensils", name: "Lavar mis utensilios", short: "Platos", icon: "🍽️", stars: 1 },
      { id: "brush_teeth", name: "Cepillarme los dientes", short: "Dientes", icon: "🦷", stars: 1 }
    ],
    learning: [
      { id: "reading", name: "Lectura", short: "Lectura", icon: "📖", stars: 3, weekdaysOnly: true },
      { id: "reading_summary", name: "Resumen de lectura", short: "Resumen", icon: "✏️", stars: 3, weekdaysOnly: true },
      { id: "math", name: "Matemáticas", short: "Matemáticas", icon: "🔢", stars: 3, weekdaysOnly: true }
    ]
  },
  dailyMax: { weekday: 13, weekend: 4 },
  weeklyMax: 73,
  levels: [
    { min: 0, name: "Semillita", level: 1 },
    { min: 50, name: "Brote Brillante", level: 2 },
    { min: 150, name: "Exploradora Estrella", level: 3 },
    { min: 300, name: "Guardiana del Cielo", level: 4 },
    { min: 500, name: "Capitana Cometa", level: 5 },
    { min: 800, name: "Reina de las Constelaciones", level: 6 },
    { min: 1200, name: "Leyenda Estelar", level: 7 },
    { min: 2000, name: "Súper Nova", level: 8 },
    { min: 3000, name: "Maestra del Universo", level: 9 }
  ],
  achievements: [
    { id: "first_day", label: "Primer día completo", icon: "🌟", check: (s) => s.fullDays >= 1 },
    { id: "first_week", label: "Primera semana completa", icon: "📅", check: (s) => s.perfectWeeks >= 1 },
    { id: "streak_7", label: "7 días seguidos", icon: "🔥", check: (s) => s.bestStreak >= 7 },
    { id: "streak_30", label: "30 días seguidos", icon: "🚀", check: (s) => s.bestStreak >= 30 },
    { id: "reading_10", label: "10 lecturas completadas", icon: "📚", check: (s) => s.readings >= 10 },
    { id: "reading_50", label: "50 lecturas completadas", icon: "🏛️", check: (s) => s.readings >= 50 },
    { id: "math_100", label: "100 días de matemáticas", icon: "🧮", check: (s) => s.mathDays >= 100 },
    { id: "beds_30", label: "30 camas tendidas", icon: "🛏️", check: (s) => s.beds >= 30 },
    { id: "stars_100", label: "100 estrellas acumuladas", icon: "⭐", check: (s) => s.totalStars >= 100 },
    { id: "stars_500", label: "500 estrellas acumuladas", icon: "🌠", check: (s) => s.totalStars >= 500 },
    { id: "stars_1000", label: "1000 estrellas acumuladas", icon: "👑", check: (s) => s.totalStars >= 1000 }
  ]
};

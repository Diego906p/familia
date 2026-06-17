# PROJECT_CONTEXT.md — "My Space" (Panel de Luanna)

> Documento maestro del proyecto. Leyendo solo este archivo + explorando carpetas, una sesión nueva sin historial debe entender el 100%.
> Última actualización: junio 2026.

---

## 0. Cómo orientarse rápido (leer primero)

- **Es un sitio estático sin build.** No hay `npm install`, ni framework, ni compilación. Editas archivos y abres en navegador.
- **El archivo grande y vivo es `js/pizarra.js`** (~1900 líneas): pizarra + juego. El resto del JS es pequeño y estable.
- **Para ver un cambio:** sube el `?v=N` del archivo en su HTML (caché). Si pruebas en preview local, **recarga la página** tras editar JS.
- **Trampa #1 al depurar la pizarra:** si "no se puede dibujar", casi seguro hay un nodo `rooms/luanna-pizarra/game` viejo en Firebase bloqueando (gate del juego). Bórralo.
- **Verifica siempre en navegador** (preview_*), no asumas. El screenshot del preview a veces da timeout: usa `eval`/console logs.
- **Credenciales:** Papá `admin`/`papa2026` · Luanna `luanna`/`estrella` · Invitado = nombre libre.
- **Orden de lectura sugerido de este doc:** §1 (qué es) → §2 (arquitectura) → §4 (flujos) → §11 (modelos de datos) → el código.

---

## 1. Resumen ejecutivo

**Qué es:** Aplicación web para una niña de ~8 años ("Luanna") que combina dos cosas:
1. **Panel de hábitos/progreso** — registro diario de responsabilidades y aprendizaje, con estrellas acumuladas, niveles, rachas y logros. Filosofía: motivar (compararse consigo misma), nunca castigar ni medir rapidez.
2. **Pizarra colaborativa en tiempo real** (estilo Figma/Miro) con un **modo juego "Adivina el Dibujo"** (estilo Pinturillo/skribbl).

**Propósito:** uso familiar. Papá administra el progreso diario; Luanna lo ve desde su tablet; familiares/amigos ("invitados") pueden sumarse a la pizarra y al juego.

**Stack tecnológico:**
- **Frontend estático puro:** HTML + CSS + JavaScript vanilla. SIN framework, SIN build, SIN bundler, SIN npm. Se abre directo en el navegador.
- **Hosting:** GitHub Pages. Repo de la web: **`Diego906p/familia`** → https://diego906p.github.io/familia/
- **Datos del panel:** un archivo `data/data.json` versionado en el repo. Se actualiza vía **GitHub API** (PUT a contents) desde el panel admin con un token fine-grained.
- **Tiempo real (pizarra + juego):** **Firebase Realtime Database** (proyecto `pizarra-luana`). SDK compat por CDN (v10.12.2).
- **Imágenes/ilustraciones:** repo aparte **`Diego906p/imagenes`** servidas vía `raw.githubusercontent.com`.
- **Persistencia local:** `sessionStorage` (sesión de login), `localStorage` (config token GitHub, copia local de datos del admin).

**No hay backend propio.** Toda la lógica corre en el cliente. Firebase y GitHub API son los únicos servicios externos.

---

## 2. Arquitectura general

### Estructura de carpetas (raíz = carpeta `Luanna`)

```
Luanna/
├── index.html              # Login (Luanna / Papá / Invitado)
├── dashboard.html          # Panel de Luanna (solo lectura)
├── admin.html              # Panel de administración (Papá): registrar día, publicar
├── pizarra.html            # Pizarra colaborativa + modo juego "Adivina el Dibujo"
├── guia.html               # Manual visual de uso (didáctico, con PNGs de la librería)
├── PROJECT_CONTEXT.md      # ESTE archivo
├── README.md               # Resumen técnico corto (apunta a guia.html)
├── refuerzo_de_info.txt    # Spec original del juego (texto base)
├── libreria_play.txt       # ~4628 palabras para el juego (1 por línea, con encabezados de categoría)
│
├── css/
│   ├── styles.css          # Estilos del login(parcial) + panel admin
│   ├── styles2.css         # Estilos del dashboard de Luanna (+ bloque de pulido visual)
│   └── pizarra.css          # Estilos de la pizarra y el juego (muy grande; bloques apilados)
│
├── js/
│   ├── config.js           # Usuarios (hash SHA-256), actividades, niveles, logros, máximos
│   ├── auth.js             # login(), loginGuest(), getSession(), logout(), requireAuth()
│   ├── data.js             # loadData()/saveData(), computeStats() (rachas, niveles, etc.)
│   ├── images.js           # Manifiesto IMAGES + variantes por ánimo + applyMoods() + imgOrPlaceholder()
│   ├── svgs.js             # Ilustraciones SVG de respaldo (DESACTIVADAS; USE_SVG_FALLBACK=false)
│   ├── dashboard.js        # Render del panel de Luanna
│   ├── admin.js            # Lógica del panel admin (registro, publicar a GitHub, historial)
│   ├── pizarra.js          # Motor de pizarra PURA (dibujo). ~1550 líneas
│   └── juego.js            # Módulo independiente "Adivina el Dibujo" (IIFE GAME). Se carga
│                           #   DESPUÉS de pizarra.js; comparte scope global. La pizarra se
│                           #   acopla por GAME.blockPointer()/blockTool()/onPresence (typeof guards)
│
├── data/
│   └── data.json           # Datos: meta, messages, records, readings, mathTopics
│
├── img/                    # Copia local de imágenes (no se usa si USE_REMOTE_IMAGES=true)
│
└── Diseños/                # Mockups de referencia (NO se sirven; solo guía visual para desarrollo)
    ├── Pizarra/            # PizarraMockup_*.png (rediseño Figma)
    └── Pinturillo/         # guia_adivina_el_dibujo.html (spec del juego), Screenshot_1.jpg (estrella), Pinturillo*.jpg
```

### Patrones y decisiones de diseño

- **Páginas independientes (MPA), no SPA.** Cada `.html` es autónomo, carga sus propios scripts. La "navegación" es `location.href`. Razón: simplicidad máxima en sitio estático, sin router.
- **Sesión por `sessionStorage`** bajo la clave `luanna_session` (`{username, role, ...}`). `requireAuth(roles)` redirige a `index.html` si el rol no alcanza.
- **Versionado de caché manual:** cada `<script>`/`<link>` lleva `?v=N`. Al cambiar un JS/CSS hay que **subir N** en los HTML que lo referencian, para que navegadores/tablets recarguen la versión nueva. (Ver Convenciones.) Estado actual de versiones: `pizarra.css` = `v=20`; `pizarra.js` = `v=21`; `juego.js` = `v=5`; `styles2.css` = `v=4`; `auth.js` = `v=6`; `dashboard.js` = `v=4`; resto `v=3`.
- **`data.json` siempre fresco:** se pide con `?t=<timestamp>` único + `cache:"no-store"` → ni el navegador ni el CDN de GitHub Pages sirven copias viejas. Luanna nunca necesita "Ctrl+F5" para ver datos nuevos.
- **Imágenes remotas conmutables:** `images.js` tiene `USE_REMOTE_IMAGES = true` (repo GitHub) o `false` (carpeta `img/` local).
- **Pizarra = modelo de objetos sobre `<canvas>`:** todo elemento es un objeto JS (`{id, type, ...}`) renderizado cada frame en un solo canvas, NO pixels. Esto permite mover/editar/sincronizar elementos. La sincronización Firebase es por elemento (`rooms/luanna-pizarra/elements/<id>`).
- **Coordenadas "mundo" vs "pantalla":** la pizarra tiene zoom/pan. `pos(e)` convierte pantalla→mundo `(screen - t)/scale`. Mundo acotado: `WORLD = {w:4000, h:3000}`.
- **Autoridad del juego:** el "anfitrión activo" (`actingHost`) ejecuta las transiciones de ronda (timeout, siguiente turno). Es el admin si está online, si no el primer jugador online por orden. Evita carreras de escritura.

---

## 3. Módulos y componentes (detalle por archivo)

### `js/config.js`
- Exporta `const CONFIG` global con:
  - `CONFIG.users`: `{ admin:{role:"admin", passwordHash}, luanna:{role:"child", passwordHash} }`. Hashes **SHA-256**. Contraseñas: admin=`papa2026`, luanna=`estrella`.
  - `CONFIG.activities`: `responsibilities` (cama, cuarto, utensilios, dientes — ⭐1, 7 días) y `learning` (lectura, resumen, matemáticas — ⭐3, `weekdaysOnly:true`).
  - Niveles con nombre (Semillita, Brote Brillante, …), logros, máximos (`weeklyMax`=73).
- Depende de: nada. Se carga primero en todas las páginas.

### `js/auth.js`
- `sha256(text)` → hex (crypto.subtle).
- `login(user, pass)` → valida contra CONFIG.users; guarda sesión; retorna sesión o null.
- `loginGuest(name)` → sesión `{role:"guest", username:"guest", name, guestId}` (sin contraseña; nombre obligatorio).
- `getSession()` / `logout()`.
- `requireAuth(rolesArray)` → protege página; redirige a index si rol no permitido.
- Depende de: `CONFIG` (config.js).

### `js/data.js`
- `loadData()` → `fetch("data/data.json?t="+Date.now(), {cache:"no-store"})`; mezcla con copia local de `localStorage` (la más reciente prevalece por `meta.savedAt`).
- `saveData(data)` → guarda en `localStorage` (clave `luanna_data`).
- `computeStats(data)` → calcula estrellas totales, días completos, racha actual/mejor, semanas perfectas, lecturas, días de mate, nivel actual.
- `mondayOf`, `weekDates`, `isWeekend`, helpers de fecha.
- `ALL_ACTIVITIES` = responsabilidades + aprendizaje.
- Nota: ya NO hay medición de tiempos (se eliminó); registros antiguos con `minutes` se ignoran.

### `js/images.js`
- `IMAGES` (manifiesto): claves → `{url, variants, w, h, desc}`. Algunas con 3 variantes por ánimo.
- `USE_REMOTE_IMAGES=true` → reescribe `img/` por `IMG_BASE` (`https://raw.githubusercontent.com/Diego906p/imagenes/main/images/`).
- `applyMoods(streak, weekPct)` → elige variante (1 bien/2 medio/3 bajo) para avatar/estrella/llama/gata/copa.
- `imgOrPlaceholder(key, extraClass)` → `<img>` o placeholder punteado.
- Avatares: `avatar_luanna`, `avatar_papa`, `avatar_xr1.png` (invitado, usado directo en index.html).

### `js/dashboard.js`
- `requireAuth(["child","admin","guest"])`.
- Renderiza KPIs (estrellas, nivel, racha, progreso), matriz semanal (✔ verde / ✖ rojo / vacío gris), progreso dual, logros, "Próximamente: Jardín", footer.
- Marcaje de 3 estados leído de `data.records[fecha][actividad].done` (`true`/`false`/ausente).

### `js/admin.js`
- `requireAuth(["admin"])`.
- Formulario de registro diario (3 estados ✔/✖/sin marcar, sin tiempos).
- Mensajes motivadores, estadísticas, historial con selector de mes.
- **Publicación GitHub:** `publishData()` — lee `sha` actual (con `?t=` + no-store para evitar 409), PUT del `data.json` en base64 (UTF-8 safe). Reintento automático si 409. Config (repo/rama/token) en `localStorage` clave `luanna_gh_cfg`, panel "⚙ Publicación en GitHub" (Configurar/Guardar). Botones "💾 Guardar día" y "📤 Publicar cambios".
- "⬇ Exportar copia de seguridad" (descarga data.json). (Importar fue eliminado.)

### `js/pizarra.js` (el grande — motor de pizarra + juego)
Bloques principales (en orden aproximado):
1. **Sesión/rol:** `SESSION`, `IS_ADMIN`, `IS_GUEST`, `MY_NAME`, `MY_COLOR`, `MY_KEY` (clave de presencia: `guest-<id>` para invitados; `role-username` resto), `MAX_GUESTS=10`.
2. **Canvas/estado:** `elements[]`, `imgCache{}`, `tool`, `color` (borde), `fillColor`, `fillOn`, `borderStyle`, `brushFidelity`, `lineWidth` (máx 120), `scale/tx/ty`, `WORLD`, `selectedIds` (Set), `boardLayers`/`activeLayer`.
3. **Render:** `render()` (fondo en pantalla, contenido en mundo, orden por `layerRank` luego `z`), `drawElement()`, `drawBackground()` (white/grid/lines), `drawSelection()` (incluye manijas + nodos), `drawMarquee()`, `drawCursors()`.
4. **Geometría/hit:** `bounds()`, `polyForShape()` (triángulo/estrella/polígono), `hitElement()` (por GEOMETRÍA real: trazo/borde/relleno, no caja), `distSeg`, `pointInPoly`, nodos (`getNodes/setNode/hitNode`).
5. **Suavizado pincel:** `rdpSimplify()` + `catmullRom()` + `smoothPath()` (Precisión=crudo, Equilibrado/Suavizado=curva real).
6. **Punteros:** `down/move/up` (mouse), gestos táctiles (1 dedo dibuja, 2 dedos zoom+pan), rueda=zoom. Indicador de tamaño de pincel/borrador siguiendo el cursor (`#pzBrushCursor`).
7. **Elementos:** `addElement` (etiqueta `layer=activeLayer`), `removeElement`, `serialize` (quita `_img`/`_hidden`).
8. **Historial:** `history` (undo/redo por comandos). Ctrl+Z/Y.
9. **Grupos/portapapeles/capas/opacidad/orden/alinear/buscatrazos:** `groupSelection/ungroup`, `copy/cut/paste/duplicate`, `orderSelection` (front/forward/back/backward), `setOpacity`, `alignSel` (6 modos), `distributeSel` (h/v), `pathfinder(unite|subtract|intersect|exclude)` → resultado RASTERIZADO a imagen vía canvas compositing.
10. **Texto:** caja redimensionable, barra de formato (B/I/alineación/tamaño/color), doble-clic para editar, queda fijo en el punto de clic.
11. **Imágenes:** `importFiles()` (selector + drag&drop + Ctrl+V pegar), `optimizeSrc()` (downscale >1600px), overlay "📷 Suelta aquí", multi en cascada.
12. **Stickers:** ⭐/🎉/🏆 etc. **Calculadora** flotante. **Fondo** (white/grid/lines).
13. **Permisos (M9):** admin habilita/restringe (calculadora, borrador, texto, imágenes, stickers, limpiar). Menú desplegable "⚙ Configuración de Papá" en panel derecho.
14. **Capas:** panel derecho (solo admin); 1 capa por defecto, ＋nueva, **arrastrar para reordenar**.
15. **Selector color (M7):** widget relleno(frente)+borde(atrás), ⇄ intercambiar, ▱ sin color. `color="none"` = borde invisible.
16. **Participantes/cursores:** presencia en barra superior (nombre + luz verde/gris); cursores en vivo con nombre y color (Papá azul, Luanna rosa, invitados color por hash).
17. **SYNC (Firebase):** IIFE; refs `elements/bg/layers/permissions/cursors/presence`. Listeners child_added/changed/removed (estado completo al entrar). `presence` con onDisconnect (invitados se remueven; admin/luanna quedan offline). Aforo 10 invitados + nombre único.
18. **GAME (Adivina el Dibujo):** ver Flujos.

### HTML
- `index.html`: login con 3 avatares (Luanna img, Papá img, Invitado `avatar_xr1.png`), campo nombre para invitado, botón "📖 Ver guía". Tarjeta `max-width:480px`.
- `dashboard.html`: panel KPIs + matriz + logros. Botón "🎨 Pizarra".
- `admin.html`: registro + publicación + historial. Botón "🎨 Pizarra".
- `pizarra.html`: topbar (título, participantes, badge admin, 🎮 Jugar, 🔦 Láser, Volver) + sidebar herramientas + subbarra (undo/redo, selector color, grosor, zoom, limpiar) + stage (canvas + overlays) + panel derecho admin (Fondo/Capas/⚙Config).

---

## 4. Flujos clave (paso a paso)

### A. Autenticación
1. `index.html`: usuario elige avatar (Luanna/Papá/Invitado).
2. Luanna/Papá → escribe contraseña → `login()` valida hash SHA-256 → sesión → redirige (`admin.html` o `dashboard.html`).
3. Invitado → escribe nombre (obligatorio; provisional sugerido "Invitado 482") → `loginGuest()` → sesión → `dashboard.html`.
4. Cada página protegida llama `requireAuth([...roles])`; si la sesión no alcanza, vuelve a `index.html`.

### B. Datos diarios (Papá)
1. Papá entra a `admin.html`, elige fecha, marca actividades (✔/✖/sin marcar), escribe nota/lectura/mate.
2. "💾 Guardar día" → `saveData()` a `localStorage`.
3. "📤 Publicar cambios" → `publishData()` sube `data.json` al repo `Diego906p/familia` vía GitHub API.
4. En 1-2 min, GitHub Pages publica. Luanna abre `dashboard.html` → `loadData()` trae el `data.json` fresco (cache-bust) → `computeStats()` → render.

### C. Pizarra (tiempo real)
1. Cualquier rol entra a `pizarra.html`.
2. `SYNC` inicializa Firebase; al conectar registra presencia (`presence/<MY_KEY>`).
3. Invitado: chequea aforo (≤10) y **nombre único** entre conectados; si falla → alert + redirige.
4. Los `child_added` de `elements` traen TODO lo ya dibujado (estado completo). Cambios propios → escriben a Firebase; remotos → upsert local + render.
5. Dibujo/edición: `down/move/up` crean/mueven elementos; cada commit → `SYNC.setElement()`.

### D. Juego "Adivina el Dibujo" (estados en `rooms/luanna-pizarra/game`)
Estados: `config` → `choosing` → `playing` → `roundEnd` → (`choosing`…) | nodo borrado = fin.
1. **config:** solo Papá ve "▶ Iniciar partida" (M14). Mín 2 jugadores. No-admin ve "⏳ esperando que Papá inicie".
2. `startGame()`: baraja jugadores online → `queue`; `status=choosing`, `drawer=queue[0]`, `choices=pickThree()` (3 palabras de `libreria_play.txt`, aleatorias), `turnSeconds=99`.
3. **choosing:** el dibujante ve 3 botones de palabra; elige → `chooseWord()` → `status=playing`, `startTs=now+3000` (cuenta 3-2-1).
4. **playing (cuenta 3-2-1):** `countdownLeft>0` → timer muestra "¡3!..¡1!", dibujo bloqueado para todos.
5. **playing (dibujo):** solo el dibujante dibuja (resto bloqueado salvo pan/láser). No-dibujantes ven palabra enmascarada con **revelación gradual de letras** según el tiempo (`maskWord(g)`). Timer 99s. **Fila de estrellas** abajo (1 por jugador, encendida al acertar).
6. **Adivinar (chat del panel):** `sendGuess()` normaliza (ignora mayús/tildes/espacios). Acierto: NO se publica el mensaje; aviso de sistema "🎉 X adivinó (+N)"; el jugador queda bloqueado; **estrella grande** (`star_level.png`) con palabra + "¡Adivinaste!" + "+N" solo para quien acertó.
7. **Puntos:** adivinadores por orden 60/50/40/30/20/10; dibujante por % (0/25/50/75/100) + bono +20 si todos antes de media partida.
8. **roundEnd:** se dispara por timeout o todos acertaron. Revela palabra (grande) + "X de Y adivinaron · ✏️ +N". El anfitrión espera ~3s (ranking) → `nextTurn()`.
9. **nextTurn:** siguiente dibujante online en la cola; **jugadores nuevos se suman a la cola** (M3); rondas ilimitadas. Limpia la pizarra.
10. **Fin/cancelación:** "⏹ Terminar partida" (admin) borra el nodo `game`. Si quedan <2 jugadores → cancela automático (M14).

---

## 5. Estado actual

### ✅ Terminado
- Login con 3 roles (Luanna/Papá/Invitado), invitado con nombre único + aforo 10.
- Dashboard responsive (KPIs alineados, matriz semanal, logros, jardín "próximamente") + pulido visual.
- Admin: registro 3 estados, publicación GitHub (con reintento 409), historial por mes, exportar.
- Pizarra completa: select/select-directa(nodos)/pan/lápiz/resaltador/borrador-parcial/bote/texto/láser/línea/flecha/formas(submenú rect/círculo/triángulo/estrella/polígono)/stickers/imagen/calc. Color avanzado (relleno+borde+estilo+opacidad, M7), suavizado real, capas reales (arrastrar), grupos, alinear/distribuir, buscatrazos (raster), copiar/pegar/duplicar, deshacer/rehacer, atajos, zoom/pan, imágenes drag&drop+pegar+optimizar, cursor con tamaño, grosor máx 120.
- Juego "Adivina el Dibujo": guía completa (mecánicas 1-12 + mods M1-M14) implementada y probada con jugadores simulados.
- Pulido visual de pizarra y dashboard.
- `guia.html` con galería PNG.
- `libreria_play.txt` (~4628 palabras únicas) conectada al juego.

### ⚠️ Pendiente / no verificado
- **Subir todo al repo `familia`** (hay desarrollo local sin publicar). Sin esto no se ve online.
- **Probar el juego en 2 dispositivos físicos reales** (tablet + celular). Solo probado con presencias simuladas.
- **Reglas de Firebase RTDB**: confirmar abiertas y SIN caducidad (el "modo prueba" caduca a ~30 días). Regla sugerida: `{ "rules": { "rooms": { ".read": true, ".write": true } } }`.
- **Token GitHub** caduca ~1 año → renovar.

### 🟢 Mejoras opcionales (no bloqueantes)
- Buscatrazos **vectorial real** (hoy genera imagen rasterizada).
- Imágenes en móvil: **compartir nativo** (Web Share Target). El selector/drag/pegar ya funciona.
- Actualizar `guia.html` con lo último del juego (3-2-1, estrella, puntos nuevos, revelación de letras).

### ❌ Roto
- Nada conocido. (Ver "Problemas resueltos" para trampas.)

---

## 6. Decisiones técnicas y convenciones

- **Idioma:** todo en español (UI, comentarios, variables de dominio).
- **Sin build:** editar archivos y abrir. No hay transpilación. JS vanilla ES6+.
- **Naming:**
  - IDs de DOM de la pizarra: prefijo `pz` (ej. `pzCanvas`, `pzGamePanel`) y del juego `pzg` (ej. `pzgTime`, `pzgChat`).
  - Clases CSS: prefijo `pz-` (pizarra) y `pzg-` (juego).
  - Funciones en camelCase; constantes de dominio en MAYÚSCULAS (`WORDS`, `WORLD`, `TURN_SECS`, `FILLABLE`).
- **Versionado de caché (IMPORTANTE):** al cambiar un `.js`/`.css`, subir el `?v=N` en TODOS los HTML que lo cargan. Es la causa #1 de "no veo mi cambio".
- **Verificación obligatoria:** usar las herramientas `preview_*` (servidor local) para validar en navegador; nunca asumir. Tras editar JS, **recargar** el preview (los `eval` corren contra la página ya cargada, no recargan solos).
- **Firebase config** está hardcodeada en `js/pizarra.js` (dentro de la IIFE `SYNC`). Es config pública de cliente (apiKey de Firebase no es secreta); la seguridad real serían las reglas de la RTDB.
- **Token GitHub:** NUNCA se sube al repo; vive solo en `localStorage` del navegador de Papá.
- **Buscatrazos = raster:** decisión pragmática. Booleanas vectoriales puras requieren librería de clipping pesada; se optó por componer en un canvas (`globalCompositeOperation`) y exportar PNG → fiable y visual, aunque no editable como vector.
- **Borrador = object-model:** parte trazos a mano (densifica + corta por círculo de radio = grosor). En formas/imágenes/texto borra el objeto solo si se toca su geometría (no la caja vacía).
- **Juego sin persistencia histórica:** el contenido de la pizarra vive en Firebase hasta "🗑️ Limpiar todo"; el juego se borra al terminar partida. No hay base de datos de partidas.
- **Paleta:** morado `#7c5cff` / morado oscuro `#4f3a9e` / rosa `#ff4f9a` / fuente Nunito. Estilo "infantil pero prolijo".
- **Responsive:** breakpoints móvil ≤480 / tablet 481-1024 / desktop ≥1025 (la pizarra usa además ≤760 y ≤900 para reacomodar barras/panel de juego). Regla: sin scroll horizontal nunca.

---

## 7. Problemas resueltos (para no repetir)

1. **Datos no sincronizaban entre dispositivos** → era `localStorage` (por dispositivo). Solución: publicación a `data.json` vía GitHub API + carga con cache-bust `?t=`.
2. **Error 409 al publicar** ("does not match sha") → la lectura del `sha` se cacheaba. Solución: leer `sha` con `?t=`+`no-store` y reintento automático una vez.
3. **Caché en tablet** → versionado `?v=N` en HTML + `data.json` con `?t=`. Para forzar recarga en tablet: pestaña incógnito o borrar caché del sitio.
4. **`escapeHtml` no existía en pizarra.js** (solo en admin/dashboard) → el panel de participantes salía vacío. Solución: definirlo en pizarra.js.
5. **Avatar de Luanna se veía pequeño / regla de tipografía duplicada** pisaba el saludo → consolidada.
6. **Suavizado del pincel no se notaba** (Chaikin leve, parecía polilínea) → reescrito con RDP (quita temblor) + Catmull-Rom (curva real). Precisión=crudo.
7. **`down()` no dibujaba (todo bloqueado)** → había un nodo `game` viejo en Firebase con `status` playing/choosing; el gate del juego bloquea el dibujo a no-dibujantes. **Trampa recurrente:** si "no se puede dibujar", borrar `rooms/luanna-pizarra/game`.
8. **Selección requería tocar toda la caja** → `hitElement` reescrito a geometría real (distancia a segmentos / point-in-poly / anillo de elipse).
9. **Trazos rectos no se podían partir con el borrador** (solo 2 puntos) → densificar el trazo antes de cortar.
10. **Texto se desplazaba al confirmar** → padding del editor a 0 + se conserva el punto de clic exacto.
11. **Presencias fake/obsoletas** en `presence` rompen pruebas del juego (jugadores que no existen "online"). Limpiar nodos de prueba tras testear.
12. **El screenshot del preview falla intermitentemente** (timeout) — no es bug de la app; verificar por `eval`/`console_logs`.

---

## 8. Próximos pasos (tareas concretas)

1. **Subir al repo `familia`** todos los archivos modificados (índice abajo) y verificar en https://diego906p.github.io/familia/.
2. **Prueba real 2 dispositivos:** abrir pizarra en tablet (Luanna) + celular (Papá) + opcional invitado; jugar una partida completa: elegir palabra, 3-2-1, dibujar, adivinar, estrella, ranking, rotación, terminar.
3. **Firebase reglas:** en consola → Realtime Database → Reglas → poner `{ "rules": { "rooms": { ".read": true, ".write": true } } }` (sin caducidad).
4. **Token GitHub:** anotar fecha de caducidad (~1 año) para renovar.
5. (Opcional) Actualizar `guia.html` con las novedades del juego.
6. (Opcional) Buscatrazos vectorial real / compartir imágenes nativo en móvil.

---

## 9. Comandos importantes

**No hay build ni tests automatizados.** Es un sitio estático.

### Correr local (cualquiera de estas):
```bash
# Opción 1: Python
cd "D:/1. CONSORCIO/22. APLICATIVOS/ClaudeAPPs/Luanna"
python -m http.server 8123     # luego abrir http://localhost:8123

# Opción 2: doble clic en index.html
#   (funciona para login/dashboard/admin; la pizarra+Firebase también).
#   Nota: GitHub API publish y Firebase requieren contexto http(s) o file:// con conexión.
```

### Publicar (deploy):
- Subir archivos al repo **`Diego906p/familia`** (rama `main`, raíz). GitHub → Settings → Pages → Source: main/root.
- URL: https://diego906p.github.io/familia/

### "Testear":
- Manual, en navegador, con los mockups de `Diseños/` como referencia.
- Firebase de prueba: nodos bajo `rooms/luanna-pizarra/`. Para resetear el juego/pizarra, borrar los nodos `game` / `elements`.

### Credenciales de prueba:
- Papá: usuario `admin` / `papa2026`
- Luanna: usuario `luanna` / `estrella`
- Invitado: cualquier nombre

### Archivos a subir tras la última sesión (si aún no):
`index.html`, `dashboard.html`, `admin.html`, `pizarra.html`, `guia.html`, `README.md`, `PROJECT_CONTEXT.md`, `libreria_play.txt`, `css/styles.css`, `css/styles2.css`, `css/pizarra.css`, `js/config.js`, `js/auth.js`, `js/data.js`, `js/images.js`, `js/svgs.js`, `js/dashboard.js`, `js/admin.js`, `js/pizarra.js`, `js/juego.js`, `data/data.json`.
(La carpeta `Diseños/` NO necesita subirse — son mockups de desarrollo.)

---

## 10. Servicios externos y claves

- **Repo web:** `Diego906p/familia` (GitHub Pages).
- **Repo imágenes:** `Diego906p/imagenes` → `https://raw.githubusercontent.com/Diego906p/imagenes/main/images/`.
- **Firebase:** proyecto `pizarra-luana`, RTDB `https://pizarra-luana-default-rtdb.firebaseio.com`. Config en `js/pizarra.js` (IIFE SYNC). Nodos: `rooms/luanna-pizarra/{elements, layers, bg, permissions, presence, cursors, game}`.
- **GitHub token:** fine-grained, permiso `Contents: Read and write` solo sobre `familia`. Se pega en el panel admin (se guarda en `localStorage`, clave `luanna_gh_cfg`).

---

## 11. Referencia de modelos de datos

### `data/data.json` (panel de hábitos)
```jsonc
{
  "meta": { "lastUpdate": "2026-06-13", "version": 1, "savedAt": 1781362248231 },
  "messages": [ { "date": "2026-06-13", "text": "Mensaje motivador…" } ],
  "records": {
    "2026-06-13": {
      "make_bed":       { "done": true },     // true=✔ / false=✖ / ausente=sin marcar
      "organize_room":  { "done": true },
      "wash_utensils":  { "done": false },
      "brush_teeth":    { "done": true },
      "reading":        { "done": true },     // aprendizaje: solo lun-vie
      "reading_summary":{ "done": true },
      "math":           { "done": true },
      "note": "Observación del día (opcional)"
    }
    // … una clave por fecha YYYY-MM-DD
  },
  "readings":   [ { "date": "2026-06-10", "title": "El Principito (cap. 3)" } ],
  "mathTopics": [ { "date": "2026-06-10", "topic": "Divisiones simples" } ]
}
```
Claves de actividad (en `config.js`): responsabilidades `make_bed, organize_room, wash_utensils, brush_teeth` (⭐1, 7 días); aprendizaje `reading, reading_summary, math` (⭐3, `weekdaysOnly`).

### Firebase RTDB — `rooms/luanna-pizarra/`
```jsonc
{
  "elements": {                       // un hijo por elemento dibujado
    "<id>": {
      "id": "...", "type": "path|highlighter|line|arrow|rect|circle|triangle|star|polygon|text|sticker|image",
      "z": 12, "layer": "L1", "color": "#3c3160", // color="none" => sin borde
      "width": 4, "opacity": 1, "fill": "#ffd23d|null", "borderStyle": "solid|dashed|dotted",
      "locked": false, "groupId": "g-…|undefined",
      // según type: points:[{x,y}] | x1,y1,x2,y2 | x,y,w,h | text,size,bold,italic,align | emoji,label | src(dataURL)
    }
  },
  "layers": [ { "id": "L1", "name": "Capa 1" } ],   // orden = profundidad
  "bg": "white|grid|lines",
  "permissions": { "calculator": true, "eraser": true, "text": true, "image": true, "stickers": true, "clear": true },
  "presence": { "<key>": { "name": "Papá", "online": true, "role": "admin", "t": 0 } },
  "cursors":  { "<key>": { "name", "color", "x", "y", "laser": false, "t" } },
  "game": {                            // existe solo durante una partida
    "status": "config|choosing|playing|roundEnd",
    "host": "admin-admin", "turnSeconds": 99,
    "queue": ["guest-x","admin-admin","child-luanna"],
    "round": 1, "drawer": "<key>",
    "choices": ["gato","casa","sol"],  // 3 palabras (solo en choosing)
    "word": "gato",                    // null hasta elegir
    "startTs": 1781…+3000,             // momento en que arranca el dibujo (3s lead = cuenta 3-2-1)
    "guessed": { "<key>": 1 },          // orden de acierto por jugador
    "scores": { "<key>": 60 },
    "names":  { "<key>": "Papá" },
    "roundResult": { "word", "drawerName", "got", "total", "dpts", "bonus" },
    "roundEndTs": 0,
    "chat": { "<pushId>": { "key","name","text","t" } | { "system": true, "text","t" } }
  }
}
```
**`<key>` de presencia/juego:** invitados = `guest-<guestId>`; Papá/Luanna = `<role>-<username>` (`admin-admin`, `child-luanna`).
**Puntos:** adivinadores por orden `[60,50,40,30,20,10]`; dibujante `round(frac*4)/4*100` (0/25/50/75/100) + bono `+20` si todos aciertan antes de la mitad del tiempo.

---

## 12. Atajos de teclado (pizarra)

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| `V` | Seleccionar | `Ctrl+C/V/X` | Copiar/Pegar/Cortar |
| `A` | Selección directa (nodos) | `Ctrl+D` | Duplicar |
| `B` | Pincel | `Ctrl+Z` / `Ctrl+Y` | Deshacer / Rehacer |
| `T` | Texto | `Ctrl+A` | Seleccionar todo |
| `M` / `L` | Rectángulo / Círculo | `Ctrl+G` / `Ctrl+Shift+G` | Agrupar / Desagrupar |
| `E` | Borrador | `Supr` / `Backspace` | Eliminar selección |
| `H` | Mano (pan) | Rueda mouse | Zoom |
| `Shift+L` | Puntero láser | Botón central + arrastrar | Pan temporal |

Transformaciones: `Shift` al dibujar/redimensionar = mantener proporción (cuadrado/círculo perfecto) · `Alt`+arrastrar = duplicar al mover · `Shift`+clic = sumar/quitar de la selección múltiple.

---

## 13. Última actualización Codex - 2026-06-16

Archivos activos: `pizarra.html` carga `css/pizarra.css?v=21`, `js/pizarra.js?v=22` y `js/juego.js?v=5`.

Cambios aplicados:
- Chat del modo juego: `Supr`/`Backspace` ya no son interceptados cuando el foco está en el input del chat o cualquier campo de texto.
- Juego: el borrador queda bloqueado para usuarios que están adivinando, también durante el arrastre.
- Color: el selector muestra relleno al frente y borde detrás; el botón "sin color" usa cuadrado con diagonal roja; al seleccionar un objeto se reflejan borde/relleno del objeto.
- Portapapeles: `Ctrl+V` pega desplazado; `Ctrl+Shift+V` pega en el mismo lugar.
- Selección directa: puede convertir formas comunes a puntos libres (`customPoints`) y mover un único vértice sin desplazar los demás.
- Permisos: `clear` inicia deshabilitado para no-admin; Config incluye herramientas principales y nuevas (`select`, `directselect`, `pan`, `pencil`, `highlighter`, `eraser`, `fill`, `gradient`, `eyedropper`, `text`, `rotate`, `mirror`, `shapes`, `stickers`, `image`, `calculator`, `laser`, `clear`). Capas queda visible para todos.
- Herramientas nuevas: Gotero, Degradado, Rotar y Espejo en la barra. El degradado usa relleno como primer color y borde como segundo; "sin color" funciona como transparente.
- Transformaciones: `Alt`+arrastrar duplica; si se mantiene `Shift`, restringe la trayectoria a horizontal/vertical. Rotar se arrastra con herramienta `R`; `Shift` ajusta a grados enteros.
- UI: Trazo y pincel abre anclado bajo su botón, sin "Recientes"; el ancho de "Punta" fue corregido. Iconos actualizados para selección directa, pincel, candado de objeto y cadena de proporción.
- Invitados: entran directo a `pizarra.html` en vez de ver el dashboard de Luanna.

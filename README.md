# Panel de Actividades de Luanna 🌟

Aplicación web estática para el seguimiento de hábitos, responsabilidades y aprendizaje de Luanna. Pensada para publicarse en **GitHub Pages**.

> 📖 **Manual completo:** abre [`guia.html`](guia.html) en el navegador para la guía visual con todo el detalle (uso diario, publicación, token, reglas, imágenes). Este README es el resumen técnico.

## Estructura

```
index.html        → Login (elige Luanna o Papá)
dashboard.html    → Panel de Luanna (solo lectura)
admin.html        → Panel de administración (papá)
guia.html         → Manual / guía visual

css/styles.css    → Estilos del login y panel admin
css/styles2.css   → Estilos del dashboard de Luanna

js/config.js      → Actividades, estrellas, niveles, logros y usuarios
js/auth.js        → Autenticación (login / sesión)
js/data.js        → Carga, guardado y cálculos (rachas, niveles…)
js/images.js      → Mapa de imágenes y variantes por ánimo
js/svgs.js        → Ilustraciones SVG de respaldo (desactivadas)
js/dashboard.js   → Lógica del panel de Luanna
js/admin.js       → Lógica del panel de administración

data/data.json    → Datos (registros, mensajes, lecturas, temas)
img/              → Imágenes locales (también servidas desde repo aparte)
```

## Usuarios

| Perfil | Usuario | Contraseña | Permisos |
|---|---|---|---|
| 👧 Luanna | `luanna` | `estrella` | Solo ver su progreso |
| 👨‍💼 Papá | `admin` | `papa2026` | Registrar y administrar |

Para cambiarlas: generar el hash SHA-256 de la nueva contraseña y reemplazarlo en `js/config.js`.

> Nota: al ser un sitio estático, la autenticación es una barrera de acceso ligera (suficiente para uso familiar), no seguridad de nivel bancario.

## Uso diario (papá)

1. Entra como **Papá** en `admin.html` y elige la fecha.
2. Marca cada actividad: **Realizado ✔** / **No realizado ✖** / sin marcar (sin información).
3. Opcional: observación, lectura realizada, tema de matemáticas.
4. **💾 Guardar día**.
5. **📤 Publicar cambios** → sube `data/data.json` al repo vía API de GitHub; en 1–2 min se ve en todos los dispositivos.

La publicación se configura **una sola vez por navegador** (tarjeta *⚙ Publicación en GitHub → Configurar*) con: repositorio (`Diego906p/familia`), rama (`main`) y un **token** `github_pat_…` con permiso *Contents: Read and write* sobre ese repo. El token se guarda solo en el navegador — nunca subirlo al repositorio.

## Publicar en GitHub Pages (primera vez)

1. Subir todo el contenido de la carpeta al repositorio.
2. En GitHub: **Settings → Pages → Source: main branch / root**.
3. La web queda en `https://<usuario>.github.io/<repo>/` — en este caso `https://diego906p.github.io/familia/`.

## Reglas de negocio

- **Responsabilidades** (7 días/semana): cama, cuarto, utensilios, dientes — ⭐1 c/u.
- **Aprendizaje** (lun–vie): lectura, resumen, matemáticas — ⭐3 c/u (no aparecen fin de semana).
- Máximos: 13⭐/día entre semana, 4⭐/día fin de semana, 73⭐/semana.
- **3 niveles**: Excelente (80–100%) · En progreso (50–79%) · Necesita ayuda (0–49%).
- Rachas, niveles con nombre y logros se calculan automáticamente desde los registros.

## Imágenes

Definidas en `js/images.js`, servidas desde el repo `Diego906p/imagenes`. Para cambiar un gráfico, reemplazar el archivo allí (mismo nombre). Algunas tienen 3 variantes por ánimo (avatar, estrella, llama/hielo, copa, avatar de papá) que cambian según el desempeño. `USE_REMOTE_IMAGES = false` usa la carpeta local `img/`.

## Caché

- `data/data.json` se pide con `?t=<timestamp>` único → siempre fresco, **sin necesidad de refrescar** en la tablet de Luanna.
- Los `.css` y `.js` llevan `?v=N` en los HTML; subir ese número al publicar cambios grandes de código.

# AltMatch · C.F. Madrid Río – Arganzuela 'C'

[📱 Ir a la web](https://manuvaldi.github.io/altmatchapp) | [📦 Código](https://github.com/manuvaldi/altmatchapp)

Web **mobile-first** y **offline-first** para seguir al equipo: clasificación, calendario, resultados y próximo partido.
Datos oficiales de la [RFFM](https://www.rffm.es), con **cache de 6 días** y botón de refrescar.

- **Temporada:** 2026-2027 (`22`)
- **Competición:** Preferente Benjamín F-7 (`26737926`)
- **Grupo:** 14 – Cotorruelo (`26737940`)
- **Equipo:** C.F. MADRID RIO - ARGANZUELA 'C' (`4941878`)

Todo está en `config.json`. Para seguir a otro equipo o grupo, cámbialo allí y regenera datos.

## Características

✅ **Mobile-first**: responsive a partir de 430 px
✅ **Offline-first**: Service Worker con cache por 6 días
✅ **Botón de refrescar**: fuerza descarga de datos nuevos sin perder UI
✅ **Automático**: GitHub Actions actualiza datos 2x/día
✅ **Localizable**: Prueba antes de subir a GitHub

## Desarrollo local

```bash
# Opción 1: Sin contenedor (rápido)
./dev.sh
# → http://localhost:8080

# Opción 2: Con podman/docker
podman build -t altmatch .
podman run --rm -p 8080:8080 altmatch
# → http://localhost:8080
```

El script `dev.sh`:
1. Descarga datos frescos de la RFFM (`npm run fetch`)
2. Sirve `public/` en http://localhost:8080
3. El Service Worker cachea todo por 6 días
4. Botón 🔄 en abajo a la derecha para refrescar sin recargar

### Modificar el equipo

```bash
# Editar config.json con nuevos IDs
nano config.json

# Regenerar datos
npm run fetch

# Probar en local
./dev.sh
```

## Puesta en marcha en GitHub Pages

1. Sube el repositorio a GitHub (rama `main`).
2. En **Settings → Pages**, en *Build and deployment* elige **Source: GitHub Actions**.
   Es un paso manual que hay que hacer **antes** del primer despliegue: el token del
   workflow (`GITHUB_TOKEN`) no tiene permiso para activar Pages por sí solo.
3. Cada push a `main` despliega la web en GitHub Pages.
4. El workflow `.github/workflows/update-data.yml` ejecuta `npm run fetch` dos veces al día
   (09:00 y 19:00 hora de Madrid) y hace commit automático si hay cambios.

**Si el despliegue falla** con `Get Pages site failed. Please verify that the repository
has Pages enabled and configured to build using GitHub Actions`: falta el paso 2. Actívalo
y luego **Re-run jobs** en la pestaña *Actions* (no hace falta un commit nuevo).

### Instalar en móvil o PC

La web es una PWA (Progressive Web App) instalable. Hay un botón flotante verde 📱
que aparece cuando la app se puede instalar (Android/Chrome/Edge) o en iPhone/iPad
(donde se muestran las instrucciones). Desaparece una vez instalada. Al hacer clic:

1. **Android**: elige "Instalar aplicación"; aparecerá un ícono en la pantalla
   de inicio y se abre como una aplicación nativa.
2. **iPhone/iPad**: el navegador no lo soporta. Alternativa: **Share → Add to Home
   Screen** (el ícono viene del `apple-touch-icon`).
3. **PC/Mac**: los navegadores modernos (Chrome, Edge) mostrarán el aviso en la
   barra de direcciones o un ícono en el menú. Una vez instalada, se abre en su
   propia ventana sin barra de direcciones.

Los datos (snapshot + escudos) se cachean mínimo 6 días; el botón 🔄 recarga los
datos sin perder la caché de código.

### Fuera de los buscadores

La web es de un equipo infantil y no debe salir en Google ni en otros buscadores:

- `index.html` lleva `<meta name="robots" content="noindex, nofollow">`. Es lo que
  de verdad funciona: Google lo lee y retira la URL del índice.
- `public/robots.txt` bloquea a buscadores y a rastreadores de IA (GPTBot, CCBot,
  ClaudeBot, PerplexityBot…). Ojo: los robots sólo leen `/robots.txt` de la raíz
  del dominio, así que en una *project page* (`manuvaldi.github.io/altmatchapp/`) puede que
  no lo lean nunca; el `noindex` del HTML sí aplica siempre.
- No hay forma de añadir cabeceras HTTP (`X-Robots-Tag`) en GitHub Pages.

### Publicar cambios de código

El app shell (html/js/css) se sirve desde caché, así que al tocar `index.html`,
`app.js`, `styles.css` o `names.js` hay que **subir `CACHE_NAME` en `sw.js`**
(p. ej. `altmatch-v8` → `altmatch-v9`). Así el navegador instala el SW nuevo, y la
página se recarga sola una vez para mostrar el código actualizado.

### Iconos de la app

Los iconos de la PWA y el favicon se generan desde el escudo del equipo
(`npm run icons`, requiere Pillow). Están versionados en `public/icons/`, así que
no hace falta regenerarlos salvo que cambie el escudo:

```bash
npm run icons
```

> El manifest **no** puede apuntar a `data/crests/`: ese directorio se borra y se
> vuelve a descargar en cada `npm run fetch`, y además el escudo original mide
> 100×105 px (el navegador lo rechaza si el manifest declara 192×192).

Para **forzar un refrescar** sin esperar al horario:
- Abre **Actions → Actualizar datos RFFM → Run workflow**

## Estructura

```
config.json                  temporada, competición, grupo y equipo
scripts/fetch-data.mjs       descarga y normaliza datos de la RFFM
scripts/make-icons.py        genera los iconos de la PWA a partir del escudo
public/
  ├─ index.html             estructura HTML
  ├─ app.js                 lógica (ES6, sin dependencias)
  ├─ names.js               anonimizado de apellidos (web + generador)
  ├─ styles.css             diseño responsive (dark mode)
  ├─ sw.js                  Service Worker (cache + refrescar)
  ├─ manifest.json          PWA (installable)
  ├─ icons/                 iconos 192/512/maskable/favicon (generados)
  └─ data/
      ├─ snapshot.json      datos generados (clasificación, partidos, etc)
      └─ crests/            escudos descargados
.github/workflows/
  ├─ update-data.yml        cron: refrescar datos 2x/día
  └─ deploy-pages.yml       desplegar en GitHub Pages
Dockerfile                   imagen para podman/docker
dev.sh                       servidor de desarrollo (bash)
```

## Funcionamiento técnico

La API de la RFFM **no envía cabeceras CORS**, así que una web en GitHub Pages no puede consultarla directamente.
Solución: `scripts/fetch-data.mjs` descarga todo en "build time" y genera `snapshot.json` con los escudos en local.
La web solo lee ese fichero estático.

**Descarga de datos (`scripts/fetch-data.mjs`):**
- **1 petición por segundo** como máximo: la RFFM parece bloquear las ráfagas
- **Reintentos con espera creciente** (hasta 4 ciclos) para las jornadas que devuelven `null`
- **Nunca sobrescribe** un snapshot guardado más completo (si falla la red, conserva el anterior)
- En CI (`ALTMATCH_REQUIRE_COMPLETE=1`) el job falla antes de publicar datos a medias

**Service Worker (`public/sw.js`):**
- **App shell cache-first**: html/js/css quedan disponibles offline
- **Datos network-first**: `snapshot.json` se pide a la red (timeout 4 s) y, si falla o llega
  incompleto, se usa la copia cacheada; así nunca se queda pegado un dato roto
- **Validación**: antes de cachear se comprueba que el JSON tenga jornadas
- **Refrescar manual**: el botón 🔄 pide datos nuevos y repinta sin recargar la página
- **Robustez**: si falta la clasificación, la app lo indica con un aviso y un botón de reintento
  (antes rompía con `Cannot read properties of null`)

**Rendimiento:**
- Sin dependencias JavaScript (puro ES6)
- CSS único: ~18 KB
- App JS: ~20 KB
- Snapshot: ~20 KB (12 equipos × 11 jornadas)
- Escudos: ~500 KB (9 equipos)
- **Total:** ~560 KB descargados una vez, después offline

## Verificación en navegador real

Una vez levantado `./dev.sh` o el contenedor, abre http://localhost:8080 en tu móvil o desktop y verifica:

### Vista "Resumen"
- [ ] Encabezado azul con escudo del equipo
- [ ] 3 estadísticas (posición, puntos y diferencia)
- [ ] Sección "Próximo partido" con J4, fecha, horario, rival, campo
- [ ] Sección "Posición actual" mostrando 10º de 12 con 3 puntos
- [ ] Sección "Últimos resultados" (los 3 partidos jugados con resultado)

### Vista "Clasificación"
- [ ] Tabla con 12 equipos
- [ ] Tu equipo (Madrid Río C, 10º) resaltado en azul
- [ ] Columnas: pos, equipo, PJ, V, E, D, DG, Pts, Forma

### Vista "Calendario"
- [ ] 11 jornadas expandidas
- [ ] Cada jornada muestra el(los) partido(s) del equipo
- [ ] Partidos jugados con resultado coloreado (verde=victoria, rojo=derrota, naranja=empate)
- [ ] Partidos pendientes con hora y "--" en resultado

### Vista "Equipo"
- [ ] Nombre del equipo, club, categoría, domicilio
- [ ] 15 jugadores listados
- [ ] Delegado: BERMEJO GARCIA, JULIO
- [ ] Equipación en azul royal

### Service Worker & Cache
- [ ] Abre DevTools (F12) → Application → Service Workers → debe estar "activated and running"
- [ ] Application → Cache Storage → "altmatch-v1" con archivos
- [ ] Desconecta internet (DevTools → Network → Offline) → aún funciona con cached
- [ ] Botón 🔄 abajo a la derecha rotando
- [ ] Al clickar refrescar → toast "Refrescando datos..."

### Responsividad
- [ ] Mobile (430px): sin desbordamiento horizontal, tabs scrolleable
- [ ] Desktop (1280px): tabla de clasificación con más columnas visibles, layout de grid

### Performance
- [ ] Primera carga: descarga ~560 KB (datos + escudos)
- [ ] Segunda carga: cachea todo, carga al instante (< 200 ms)
- [ ] Offline: funciona completamente sin red

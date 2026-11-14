# AltMatch · C.F. Madrid Río – Arganzuela 'C'

Web estática para seguir al equipo: clasificación, calendario, resultados y próximo partido.
Datos oficiales de la [RFFM](https://www.rffm.es).

- **Temporada:** 2026-2027 (`22`)
- **Competición:** Preferente Benjamín F-7 (`26737926`)
- **Grupo:** 14 – Cotorruelo (`26737940`)
- **Equipo:** C.F. MADRID RIO - ARGANZUELA 'C' (`4941878`)

Todo está en `config.json`. Para seguir a otro equipo o grupo, cámbialo allí.

## Cómo funciona

La API de la RFFM no permite llamadas desde el navegador (no envía cabeceras CORS),
así que un script descarga los datos y genera `public/data/snapshot.json` con los escudos en local.
La web sólo lee ese fichero.

```
npm run fetch      # regenera public/data/ (requiere Node 18+)
```

Un workflow de GitHub Actions (`.github/workflows/update-data.yml`) lo ejecuta dos veces al día
y hace commit si hay cambios. Otro (`deploy-pages.yml`) publica `public/` en GitHub Pages.

## Puesta en marcha en GitHub Pages

1. Sube el repositorio a GitHub (rama `main`).
2. En **Settings → Pages**, en *Build and deployment* elige **Source: GitHub Actions**.
3. Cada push a `main` despliega la web. Para forzar una actualización de datos, lanza
   manualmente el workflow *Actualizar datos RFFM* desde la pestaña **Actions**.

## Estructura

```
config.json                 temporada, competición, grupo y equipo
scripts/fetch-data.mjs      descarga y normaliza los datos de la RFFM
public/                     web estática (index.html, app.js, styles.css)
public/data/snapshot.json   datos generados
public/data/crests/         escudos descargados
.github/workflows/          actualización de datos y despliegue
```

# 🚀 Inicio rápido

## Opción 1: Sin contenedor (más rápido)

```bash
./dev.sh
# → abre http://localhost:8080 en tu navegador
```

## Opción 2: Con podman/docker

```bash
podman build -t altmatch .
podman run --rm -p 8080:8080 altmatch
# → abre http://localhost:8080
```

## Qué esperar

✅ Encabezado azul con escudo del equipo
✅ Próximo partido: **Sábado 21 de noviembre** centrado encima
✅ Dos equipos lado a lado (local 🏠 vs visitante ✈️)
✅ Clasificación completa con tabla
✅ Calendario de 11 jornadas con resultados
✅ Plantilla: 15 jugadores
✅ Botón 🔄 para refrescar cache (esquina inferior derecha)
✅ Funciona offline una vez descargado

## Personalizar para otro equipo

Edita `config.json`:

```json
{
  "temporada": "22",
  "competicion": "26737926",
  "grupo": "26737940",
  "equipo": "4941878"
}
```

Busca los IDs en https://www.rffm.es, luego:

```bash
npm run fetch      # descarga nuevos datos
./dev.sh           # prueba en local
```

## Subir a GitHub Pages

```bash
git remote add origin https://github.com/manuvaldi/altmatchapp.git
git push -u origin main
```

En **Settings → Pages**, en *Build and deployment* elige **Source: GitHub Actions**.
Hazlo **antes** del primer push: si no, el workflow falla con
`Get Pages site failed` (el `GITHUB_TOKEN` no puede activar Pages solo).
El sitio se despliega en `https://manuvaldi.github.io/altmatchapp/`
y se actualiza 2x/día.

---

¿Dudas? Revisa [README.md](README.md).

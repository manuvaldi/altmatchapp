#!/usr/bin/env bash
# AltMatch — servidor local de desarrollo (sin contenedor)
# Uso: ./dev.sh [puerto]
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "▶ Descargando datos de la RFFM..."
npm run --silent fetch
echo "▶ Sirviendo en http://localhost:${PORT}"
cd public
exec python3 -m http.server "$PORT" --bind 127.0.0.1

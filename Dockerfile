# AltMatch — contenedor para probar en local
#
#   podman build -t altmatch .
#   podman run --rm -p 8080:8080 altmatch
#
# (idéntico con docker: docker build / docker run)
#
# Al arrancar regenera los datos de la RFFM y sirve la web en http://localhost:8080

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY config.json ./
COPY scripts ./scripts
# La web base (sin datos: se generan aquí)
COPY public ./public
RUN node scripts/fetch-data.mjs

FROM python:3.12-alpine
COPY --from=build /app/public /srv
EXPOSE 8080
CMD ["python3", "-m", "http.server", "8080", "--bind", "0.0.0.0", "--directory", "/srv"]
/**
 * Service Worker de AltMatch.
 *
 * Estrategias:
 *  - App shell (html/js/css): cache-first con revalidación en segundo plano.
 *    Queda disponible offline y se sirve al instante en visitas siguientes.
 *  - Datos (snapshot.json): network-first con timeout (4 s) y validación.
 *    Si la red falla o devuelve datos incompletos, se usa la copia cacheada,
 *    así que la app sigue funcionando offline con los últimos datos buenos.
 *  - Escudos: cache-first (cambian muy rara vez).
 *
 * No hay caducidad fija: la copia cacheada se refresca en cada visita y
 * sobrevive mientras el navegador no la purgue (muy por encima de 6 días).
 */

const CACHE_NAME = 'altmatch-v12';
const SCOPE = self.registration.scope;

const STATIC_ASSETS = [
  './', 'index.html', 'app.js', 'names.js', 'styles.css', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png',
].map(
  (a) => new URL(a, SCOPE).pathname,
);

/** fetch con timeout para no quedarse esperando una red colgada */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/* ---------- Install ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => console.warn('SW: no se pudieron precachear assets', err)),
  );
  self.skipWaiting();
});

/* ---------- Activate ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Datos: network-first con validación y fallback a caché
  if (url.pathname.endsWith('/data/snapshot.json')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        try {
          const res = await fetchWithTimeout(request, 4000);
          if (res && res.ok) {
            const text = await res.text();
            const data = JSON.parse(text);
            if (data && Array.isArray(data.rounds)) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, new Response(text, { headers: res.headers }));
              return new Response(text, { status: 200, headers: res.headers });
            }
          }
        } catch {
          /* red caída, lenta o datos corruptos: tiramos de caché */
        }
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'sin datos disponibles' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })(),
    );
    return;
  }

  // Escudos: cache-first
  if (url.pathname.includes('/data/crests/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // App shell: cache-first, revalidando en segundo plano
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Resto: network-first
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        }
        return caches.match(request).then((c) => c || res);
      })
      .catch(() => caches.match(request)),
  );
});

/* ---------- Mensajes desde la página ---------- */
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'REFRESH_CACHE') {
    const reply = (payload) => {
      const port = event.ports && event.ports[0];
      if (port) port.postMessage(payload);
    };

    const target = new URL(event.data.url || 'data/snapshot.json', SCOPE);

    // Además del snapshot, se refresca el app shell (html/js/css) para que un
    // botón "refrescar" baste cuando se publica una versión nueva del código.
    const refreshShell = caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((path) =>
          fetch(path, { cache: 'reload' })
            .then((res) => (res && res.ok ? cache.put(path, res) : null))
            .catch(() => null),
        ),
      ),
    );

    fetch(target.href, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.rounds)) throw new Error('datos incompletos');
        const cache = await caches.open(CACHE_NAME);
        await cache.put(target.href, new Response(text, { headers: res.headers }));
        await refreshShell;
        reply({ type: 'REFRESH_SUCCESS', generatedAt: data.generatedAt || null });
      })
      .catch((err) => reply({ type: 'REFRESH_ERROR', error: err.message }));
    return;
  }
});

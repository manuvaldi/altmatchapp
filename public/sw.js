/**
 * Service Worker para AltMatch
 * Cache-first: guarda datos y assets por 6 días.
 * Permite refrescar manualmente desde la UI.
 */

const CACHE_NAME = 'altmatch-v1';
const CACHE_TTL = 6 * 24 * 60 * 60 * 1000; // 6 días en ms
const CACHE_METADATA = 'altmatch-metadata';

// Rutas relativas al scope del SW: funcionan tanto en localhost como en /<repo>/ de GitHub Pages
const SCOPE = self.registration.scope;
const STATIC_ASSETS = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.json'].map((a) => new URL(a, SCOPE).pathname);

/* ========================================================================
   Install: cachear assets estáticos
   ======================================================================== */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

/* ========================================================================
   Activate: limpiar caches viejos
   ======================================================================== */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && !cacheName.startsWith('altmatch-crests')) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

/* ========================================================================
   Fetch: estrategia cache-first con refrescado en background
   ======================================================================== */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET solamente
  if (request.method !== 'GET') {
    return;
  }

  // No cachear el service worker mismo, ni llamadas POST internas
  if (url.pathname.endsWith('/sw.js')) {
    return;
  }

  // Assets estáticos: cache-first, refrescar en background
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetch_ = fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return cached || response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
          return response;
        });
        return cached || fetch_;
      }),
    );
    return;
  }

  // Datos (snapshot.json): cache-first, validar antigüedad
  if (url.pathname.endsWith('/data/snapshot.json')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Siempre intentar fetch (para refrescar en background)
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const cloned = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, cloned);
                // Guardar timestamp
                const metadata = {
                  url: request.url,
                  timestamp: Date.now(),
                };
                caches.open(CACHE_METADATA).then((m) => m.put(request.url, new Response(JSON.stringify(metadata))));
              });
              return response;
            }
            return cached;
          })
          .catch(() => cached); // Si fetch falla, usar cached

        // Si hay cached reciente, devolverlo inmediatamente
        if (cached) {
          // Validar antigüedad en background y avisar si estaba expirada
          caches
            .open(CACHE_METADATA)
            .then((cache) => cache.match(request.url))
            .then((meta) => {
              if (!meta) return;
              return meta.text().then((txt) => {
                try {
                  const data = JSON.parse(txt);
                  if (data.timestamp && Date.now() - data.timestamp > CACHE_TTL) {
                    fetchPromise.then(() => {
                      self.clients.matchAll().then((clients) => {
                        clients.forEach((client) => {
                          client.postMessage({ type: 'CACHE_UPDATED', url: request.url });
                        });
                      });
                    });
                  }
                } catch {
                  /* metadatos corruptos: ignorar */
                }
              });
            })
            .catch(() => {});
          return cached;
        }

        return fetchPromise;
      }),
    );
    return;
  }

  // Crests (imágenes): cache-first con TTL de 6 días
  if (url.pathname.includes('/data/crests/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        });
      }),
    );
    return;
  }

  // Resto: network-first (fallback a cache)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return caches.match(request);
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cloned);
        });
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

/* ========================================================================
   Mensajes desde el cliente
   ======================================================================== */

self.addEventListener('message', (event) => {
  const { type } = event.data;

  // Forzar refrescar cache
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'REFRESH_CACHE') {
    const url = event.data.url || '/data/snapshot.json';
    fetch(url)
      .then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(url, cloned);
            // Actualizar timestamp
            const metadata = { url, timestamp: Date.now() };
            caches.open(CACHE_METADATA).then((m) => m.put(url, new Response(JSON.stringify(metadata))));
            // Notificar
            event.ports[0].postMessage({ type: 'REFRESH_SUCCESS' });
          });
        }
      })
      .catch((err) => {
        event.ports[0].postMessage({ type: 'REFRESH_ERROR', error: err.message });
      });
  }
});

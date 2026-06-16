// Service worker de la app Gastos — archivo real, mismo origen (requisito del navegador
// para que la PWA abra offline). Antes el SW iba embebido como blob: URL y el navegador
// lo rechazaba, así que no había caché offline. (v2.45)
//
// Estrategia: network-first con fallback a caché.
//  - Navegación (abrir la app): intenta red, actualiza el shell cacheado, y si no hay
//    internet sirve el shell guardado → la app abre offline.
//  - Otros GET (incl. Firebase de gstatic): intenta red, cae a caché offline.
// Así cada deploy se ve apenas hay red, pero offline sigue funcionando.

const CACHE = 'gastos-v3';
const SHELL = './';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await c.add(new Request(SHELL, { cache: 'reload' }));
    } catch (err) { /* sin red en la instalación: se cachea en el primer fetch online */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Abrir la app (navegación): network-first → fallback al shell cacheado.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(SHELL, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(SHELL)) || (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Resto de GET: network-first, cae a caché offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});

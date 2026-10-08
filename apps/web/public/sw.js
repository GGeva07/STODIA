// Service worker mínimo: cachea el shell (navegación) para que la PWA sea instalable y abra sin red.
// Las llamadas a la API nunca se cachean.
const CACHE = 'stodia-shell-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('/', cp)); return res; }).catch(() => caches.match('/')));
  } else {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok && /\.(js|css|woff2?|png|svg)$/.test(r.url)) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })));
  }
});

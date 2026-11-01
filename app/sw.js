const CACHE = 'my-report-shell-v1.0.1';
const ASSETS = ['./', './index.html', './styles.css', './tokens.css', './app.mjs', './core.mjs', './storage.mjs', './backup.mjs', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('my-report-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const allowed = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
  if (event.request.mode === 'navigate') {
    // The installed shell is one coherent release. New versions activate explicitly.
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('./index.html')) || fetch(event.request)));
  } else if (allowed.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  }
});

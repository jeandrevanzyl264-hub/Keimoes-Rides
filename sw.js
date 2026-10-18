// Only a public offline page and brand assets are cached. Never cache Firebase
// responses, documents, maps, GPS, chat, authenticated HTML or private photos.
const CACHE = 'keimoes-public-v2';
const PUBLIC_ASSETS = ['/offline.html', '/icons/icon.svg', '/icons/icon-192.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('keimoes-public-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (PUBLIC_ASSETS.includes(new URL(event.request.url).pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

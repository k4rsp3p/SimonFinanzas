self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => clients.claim());
self.addEventListener('fetch', e => {
  e.respondWith(caches.open('simon-v1').then(cache =>
    cache.match(e.request).then(r => r || fetch(e.request).then(res => {
      cache.put(e.request, res.clone()); return res;
    }))
  ));
});
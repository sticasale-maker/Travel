/* Outback Loop — offline service worker */
const CACHE = 'outback-loop-v5';
const ASSETS = [
  './index.html',
  './read.html',
  './itinerary.html',
  './itinerary.css',
  './itinerary.js',
  './map.js',
  './notes.js',
  './config.js',
  './vendor/supabase.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.allSettled(ASSETS.map(function (a) { return c.add(a); }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Never touch Supabase — auth and note freshness must hit the network directly.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Page loads: use network when available, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Assets + Google Fonts: serve from cache first, then network (and cache the result).
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (r) {
        var ok = r && r.status === 200;
        var cacheable = url.origin === location.origin ||
          url.hostname.indexOf('gstatic') > -1 ||
          url.hostname.indexOf('googleapis') > -1;
        if (ok && cacheable) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return r;
      }).catch(function () { return cached; });
    })
  );
});

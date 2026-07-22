/* Outback Loop — offline service worker */
const CACHE = 'outback-loop-v16';
const IMG_CACHE = 'outback-img'; // persistent (survives app updates): journal photos + avatars
const ASSETS = [
  './index.html',
  './read.html',
  './itinerary.en.html',
  './itinerary.it.html',
  './itinerary.css',
  './outback-bg.svg',
  './i18n.js',
  './tripdata.js',
  './itinerary.js',
  './map.js',
  './features.js',
  './weather.js',
  './stats.js',
  './route.js',
  './gallery.js',
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== IMG_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Supabase: cache public storage images (photos/avatars) so they show offline
  // once seen; never cache auth / REST data / functions (those must stay fresh).
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.indexOf('/storage/v1/object/public/') === 0) {
      e.respondWith(
        caches.open(IMG_CACHE).then(function (c) {
          return c.match(req).then(function (cached) {
            var net = fetch(req).then(function (r) {
              if (r && r.status === 200) c.put(req, r.clone());
              return r;
            }).catch(function () { return cached; });
            return cached || net;
          });
        })
      );
    }
    return;
  }

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

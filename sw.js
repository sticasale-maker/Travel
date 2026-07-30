/* Outback Loop — offline service worker */
const CACHE = 'outback-loop-v41';
const IMG_CACHE = 'outback-img'; // persistent (survives app updates): journal photos, avatars, destination photos
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
  './enrichdata.js',
  './enrich.js',
  './welcome.js',
  './pull.js',
  './notify.js',
  './config.js',
  './vendor/supabase.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Destination photos — pre-cached on install so they're available offline
// before hitting the no-signal stretches (Mereenie Loop, West Macs, deserts).
// Keep in sync with the photo URLs in enrichdata.js.
const PHOTO_ASSETS = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/2020-10-08_Taronga_Western_Plains_Zoo.jpg/960px-2020-10-08_Taronga_Western_Plains_Zoo.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Aerial_view_of_Cobar%2CNew_South_Wales%2C_2009-03-06.jpg/960px-Aerial_view_of_Cobar%2CNew_South_Wales%2C_2009-03-06.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Broken_Hill_Town_%26_Line_of_Lode_Pano%2C_NSW%2C_08.07.2007.jpg/960px-Broken_Hill_Town_%26_Line_of_Lode_Pano%2C_NSW%2C_08.07.2007.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/SilvertonCrossroads.JPG/960px-SilvertonCrossroads.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Woomera.jpg/960px-Woomera.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Coober_Pedy%2C_South_Australia_-_town.jpg/960px-Coober_Pedy%2C_South_Australia_-_town.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/ViewFromKingsCanyon.JPG/960px-ViewFromKingsCanyon.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Redbank_Gorge_-_Northern_Territory.jpeg/960px-Redbank_Gorge_-_Northern_Territory.jpeg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Ellery_Creek_Big_Hole_-_West_Macdonnell_Ranges_NT.jpg/960px-Ellery_Creek_Big_Hole_-_West_Macdonnell_Ranges_NT.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/d/d8/Alice_Springs_ridge.jpeg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Travellers_Rest%2C_Marla.jpg/960px-Travellers_Rest%2C_Marla.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Jacaranda_Time_Port_Augusta.jpg/960px-Jacaranda_Time_Port_Augusta.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Hay_Water_Tower_Art%2C_Hay%2C_New_South_Wales%2C_2022%2C_04.jpg/960px-Hay_Water_Tower_Art%2C_Hay%2C_New_South_Wales%2C_2022%2C_04.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Dee_Why_Beach%2C_Sydney_2019.jpg/960px-Dee_Why_Beach%2C_Sydney_2019.jpg'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(function (c) {
      return Promise.allSettled(ASSETS.map(function (a) { return c.add(a); }));
    }),
    // Pre-cache destination photos into the persistent image cache (best-effort;
    // cross-origin so fetched no-cors and stored as opaque responses).
    caches.open(IMG_CACHE).then(function (c) {
      return Promise.allSettled(PHOTO_ASSETS.map(function (u) {
        var req = new Request(u, { mode: 'no-cors' });
        return fetch(req).then(function (r) { if (r) return c.put(req, r); });
      }));
    })
  ]));
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

  // Destination photos (Wikimedia): cache-on-view so they persist offline once seen.
  if (url.hostname === 'upload.wikimedia.org') {
    e.respondWith(
      caches.open(IMG_CACHE).then(function (c) {
        return c.match(req).then(function (cached) {
          var net = fetch(req).then(function (r) {
            if (r && (r.status === 200 || r.type === 'opaque')) c.put(req, r.clone());
            return r;
          }).catch(function () { return cached; });
          return cached || net;
        });
      })
    );
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

// Report the running version so the app can display it (to confirm updates).
self.addEventListener('message', function (e) {
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: CACHE });
});

// ---- Web Push: show a notification for new journal posts ----
self.addEventListener('push', function (e) {
  var raw = '', parseErr = '';
  try { raw = e.data ? e.data.text() : ''; } catch (x) { parseErr = 'text-failed'; }
  var data = {};
  if (raw) { try { data = JSON.parse(raw); } catch (x) { parseErr = 'json-failed'; } }

  var title = data.title || 'Insane Red Centre Loop';
  var body = data.body || 'New memory posted';
  // Diagnostic: if the payload carried no usable content, surface *why* on the
  // banner itself (empty push vs. unparseable) so we can see what iOS receives.
  if (!data.title && !data.body) {
    title = 'DBG ' + (raw ? ('payload ' + raw.length + 'B') : 'NO-PAYLOAD');
    body = parseErr ? ('parse: ' + parseErr) : (raw ? raw.slice(0, 120) : 'push arrived with no data');
  }
  var opts = {
    body: body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'new-post',
    renotify: true,
    data: { url: data.url || './index.html' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './index.html';
  var m = url.match(/d=(\d{4}-\d{2}-\d{2})/);
  var day = m ? m[1] : '';
  // Stash the target day so the app can jump to it on open, even if iOS ignores
  // the notification's URL and launches the app at its start page.
  var stash = day
    ? caches.open('nav-target').then(function (c) { return c.put('t', new Response(day)); }).catch(function () {})
    : Promise.resolve();
  e.waitUntil(stash.then(function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          if (c.navigate) { try { c.navigate(url); } catch (_) {} }
          try { c.postMessage({ type: 'go-day', day: day }); } catch (_) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    });
  }));
});

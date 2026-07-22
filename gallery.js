/* gallery.js — a photo wall: every photo across the trip in one grid, newest
   first. Reads the cached entries (works offline for photos already seen).
   Exposes window.openGallery(); the button lives in the stats strip. */
(function () {
  'use strict';
  var CFG = window.TRAVEL_CONFIG || {}, I18N = window.I18N;
  function t(k) { return I18N ? I18N.t(k) : k; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pub(path) { return CFG.SUPABASE_URL + '/storage/v1/object/public/travel-photos/' + path; }

  function readCache() {
    return new Promise(function (resolve) {
      var req = indexedDB.open('travel-notes-db', 2);
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('remote')) return resolve([]);
        db.transaction('remote', 'readonly').objectStore('remote').getAll().onsuccess = function (e) { resolve(e.target.result || []); };
      };
      req.onerror = function () { resolve([]); };
    });
  }

  window.openGallery = function () {
    var ov = document.createElement('div');
    ov.className = 'overlay gallery-overlay';
    ov.innerHTML = '<div class="overlay-panel"><button class="overlay-close" type="button" aria-label="Close">✕</button>' +
      '<h3>' + t('photos_btn') + '</h3><div class="gal-grid"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('.overlay-close')) { ov.remove(); return; }
      var img = e.target.closest('.gal-grid img');
      if (img) {
        var lb = document.createElement('div'); lb.className = 'lightbox';
        lb.innerHTML = '<img src="' + esc(img.dataset.full) + '" alt="">';
        lb.addEventListener('click', function () { lb.remove(); });
        document.body.appendChild(lb);
      }
    });

    readCache().then(function (notes) {
      var photos = [];
      notes.forEach(function (n) {
        (n.photo_paths || []).forEach(function (p) { photos.push({ url: pub(p), author: n.author, at: n.captured_at }); });
      });
      photos.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
      var grid = ov.querySelector('.gal-grid');
      if (!photos.length) { grid.innerHTML = '<div class="gal-empty">' + t('gallery_empty') + '</div>'; return; }
      grid.innerHTML = photos.map(function (p) {
        return '<figure><img loading="lazy" src="' + esc(p.url) + '" data-full="' + esc(p.url) + '" alt="">' +
          '<figcaption>' + esc(p.author || '') + '</figcaption></figure>';
      }).join('');
    });
  };
})();

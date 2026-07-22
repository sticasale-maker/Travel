/* notes.js — offline-first travel notes for the Outback Loop PWA.
   Poster (index.html): capture + sync + display.  Reader (read.html): display only.

   Storage: IndexedDB holds this device's authored notes and pending photo blobs,
   so capture works with zero network and survives restarts. A sync engine pushes
   the queue to Supabase (auth + Postgres row + Storage upload) when online. */
(function () {
  'use strict';

  // ---- Ordering within a day: 'asc' = oldest-first (diary). Flip to 'desc' for newest-first.
  var ORDER = 'asc';

  var MODE = window.TRAVEL_MODE === 'reader' ? 'reader' : 'poster';
  var CFG = window.TRAVEL_CONFIG || {};
  var CONFIGURED = CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 &&
                   CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY.indexOf('YOUR-') === -1;
  var BUCKET = 'travel-photos';

  var state = {
    sb: null,          // supabase client
    uid: null,         // auth.uid() once signed in (poster)
    author: localStorage.getItem('travel_author') || '',
    remote: [],        // last-fetched remote notes (all authors)
    syncing: false,
    attempts: {}       // note id -> {count, nextTry}
  };

  // ---------------------------------------------------------------- helpers
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  function nowISO() { return new Date().toISOString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString('en-AU',
        { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // ---------------------------------------------------------------- IndexedDB
  var DB = null;
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (DB) return resolve(DB);
      var req = indexedDB.open('travel-notes-db', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('photos')) {
          var ps = db.createObjectStore('photos', { keyPath: 'id' });
          ps.createIndex('note_id', 'note_id', { unique: false });
        }
      };
      req.onsuccess = function () { DB = req.result; resolve(DB); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(store, mode) {
    return openDB().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }
  function idbReq(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function putNote(n) { return tx('notes', 'readwrite').then(function (s) { return idbReq(s.put(n)); }); }
  function delNote(id) { return tx('notes', 'readwrite').then(function (s) { return idbReq(s.delete(id)); }); }
  function allNotes() { return tx('notes', 'readonly').then(function (s) { return idbReq(s.getAll()); }); }
  function putPhoto(p) { return tx('photos', 'readwrite').then(function (s) { return idbReq(s.put(p)); }); }
  function delPhoto(id) { return tx('photos', 'readwrite').then(function (s) { return idbReq(s.delete(id)); }); }
  function photosFor(noteId) {
    return tx('photos', 'readonly').then(function (s) {
      return idbReq(s.index('note_id').getAll(noteId));
    });
  }

  // ---------------------------------------------------------------- photos
  // Downscale to PHOTO_MAX_DIM longest edge, export JPEG. Returns a Blob.
  function shrink(file) {
    var maxDim = CFG.PHOTO_MAX_DIM || 1600;
    var quality = CFG.PHOTO_JPEG_QUALITY || 0.7;
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          resolve(blob || file);
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- Supabase
  function initSupabase() {
    if (!CONFIGURED || !window.supabase || !window.supabase.createClient) return;
    state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }

  function ensureAuth() {
    // Poster only. Reuses persisted session; signs in anonymously if needed.
    if (MODE !== 'poster' || !state.sb) return Promise.resolve(null);
    return state.sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session) { state.uid = session.user.id; return session; }
      if (!navigator.onLine) return null;
      return state.sb.auth.signInAnonymously().then(function (r) {
        if (r.data && r.data.session) { state.uid = r.data.session.user.id; return r.data.session; }
        return null;
      });
    }).catch(function () { return null; });
  }

  function publicUrl(path) {
    if (!state.sb) return '';
    return state.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function fetchRemote() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('travel_notes')
      .select('*')
      .order('captured_at', { ascending: true })
      .then(function (res) {
        if (!res.error && res.data) { state.remote = res.data; renderAll(); }
      })
      .catch(function () {});
  }

  // ---------------------------------------------------------------- sync engine
  function backoffReady(id) {
    var a = state.attempts[id];
    return !a || Date.now() >= a.nextTry;
  }
  function noteFailed(id) {
    var a = state.attempts[id] || { count: 0 };
    a.count += 1;
    a.nextTry = Date.now() + Math.min(5 * 60000, 5000 * Math.pow(2, a.count - 1));
    state.attempts[id] = a;
  }
  function noteOK(id) { delete state.attempts[id]; }

  function syncNote(n) {
    // Upload this note's pending photos, then upsert/delete its row.
    if (n.pending_op === 'delete') {
      var paths = n.photo_paths || [];
      var rm = paths.length
        ? state.sb.storage.from(BUCKET).remove(paths).catch(function () {})
        : Promise.resolve();
      return rm.then(function () {
        return state.sb.from('travel_notes').delete().eq('id', n.id);
      }).then(function (res) {
        if (res.error) throw res.error;
        return photosFor(n.id).then(function (ps) {
          return Promise.all(ps.map(function (p) { return delPhoto(p.id); }));
        }).then(function () { return delNote(n.id); });
      });
    }

    // create / update
    return photosFor(n.id).then(function (photos) {
      var pending = photos.filter(function (p) { return !p.uploaded; });
      var paths = (n.photo_paths || []).slice();
      var chain = Promise.resolve();
      pending.forEach(function (p) {
        chain = chain.then(function () {
          var path = state.uid + '/' + n.id + '/' + p.filename;
          return state.sb.storage.from(BUCKET)
            .upload(path, p.blob, { contentType: 'image/jpeg', upsert: true })
            .then(function (res) {
              if (res.error) throw res.error;
              if (paths.indexOf(path) === -1) paths.push(path);
              p.uploaded = true; p.path = path;
              return putPhoto(p);
            });
        });
      });
      return chain.then(function () {
        n.photo_paths = paths;
        var row = {
          id: n.id, day_key: n.day_key, author: n.author || state.author || 'Traveller',
          user_id: state.uid, body: n.body || '', photo_paths: paths,
          captured_at: n.captured_at, updated_at: nowISO()
        };
        return state.sb.from('travel_notes').upsert(row).then(function (res) {
          if (res.error) throw res.error;
          n.synced = true; n.pending_op = null; n.user_id = state.uid;
          return putNote(n);
        });
      });
    });
  }

  function syncNow() {
    if (MODE !== 'poster' || !state.sb || state.syncing || !navigator.onLine) return Promise.resolve();
    state.syncing = true;
    return ensureAuth().then(function () {
      if (!state.uid) return;
      return allNotes().then(function (notes) {
        var pending = notes.filter(function (n) { return !n.synced && n.pending_op; })
          .filter(function (n) { return backoffReady(n.id); })
          .sort(function (a, b) { return (a.captured_at || '').localeCompare(b.captured_at || ''); });
        var chain = Promise.resolve();
        pending.forEach(function (n) {
          chain = chain.then(function () {
            return syncNote(n).then(function () { noteOK(n.id); })
              .catch(function () { noteFailed(n.id); });
          });
        });
        return chain;
      });
    }).then(function () {
      return fetchRemote();
    }).catch(function () {}).then(function () {
      state.syncing = false;
      renderAll();
    });
  }

  // ---------------------------------------------------------------- rendering
  function myNote(n) {
    // Local-store notes are always mine; remote notes match on user_id.
    return n._local || (state.uid && n.user_id === state.uid);
  }

  function mergedForDay(dayKey, localNotes) {
    var map = {};
    state.remote.forEach(function (n) {
      if (n.day_key === dayKey) map[n.id] = n;
    });
    localNotes.forEach(function (n) {
      if (n.day_key !== dayKey) return;
      if (n.pending_op === 'delete') { delete map[n.id]; return; }
      // local copy wins (holds pending edits / offline-only notes)
      var m = Object.assign({}, n);
      m._local = true;
      m._pending = !n.synced;
      map[n.id] = m;
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) {
      var c = (a.captured_at || '').localeCompare(b.captured_at || '');
      return ORDER === 'asc' ? c : -c;
    });
    return list;
  }

  function photoHTML(n) {
    // Prefer public URLs (remote); fall back to local blob for offline own-notes.
    var out = '';
    (n.photo_paths || []).forEach(function (p) {
      var url = publicUrl(p);
      if (url) out += '<img loading="lazy" src="' + esc(url) + '" data-full="' + esc(url) + '" alt="note photo">';
    });
    return out;
  }

  function localPhotoHTML(photos) {
    var out = '';
    (photos || []).forEach(function (p) {
      var url = URL.createObjectURL(p.blob);
      out += '<img src="' + url + '" data-full="' + url + '" alt="note photo">';
    });
    return out;
  }

  function renderDay(dayEl) {
    var dayKey = dayEl.dataset.date;
    var listEl = dayEl.querySelector('.note-list');
    if (!listEl) return;

    allNotes().then(function (locals) {
      var list = mergedForDay(dayKey, locals);
      var localById = {};
      locals.forEach(function (n) { localById[n.id] = n; });

      if (!list.length) {
        listEl.innerHTML = '<div class="note-empty">No notes yet' +
          (MODE === 'poster' ? ' — tap “Add note”.' : '.') + '</div>';
        return;
      }

      var html = list.map(function (n) {
        var mine = myNote(n);
        var badges = '';
        if (n._pending) badges += '<span class="note-badge pending">Pending sync</span>';
        else if (MODE === 'poster' && mine) badges += '<span class="note-badge mine">You</span>';

        // photos: local blobs for own offline notes, else public URLs
        var photos = '';
        if (n._local && localById[n.id]) {
          // will be filled async below; placeholder container
        }
        photos = photoHTML(n);

        var actions = '';
        if (MODE === 'poster' && mine) {
          actions = '<div class="note-actions">' +
            '<button class="edit" data-edit="' + esc(n.id) + '">Edit</button>' +
            '<button class="del" data-del="' + esc(n.id) + '">Delete</button></div>';
        }
        return '<div class="note-card" data-note="' + esc(n.id) + '">' +
          '<div class="note-meta"><span class="note-author">' + esc(n.author || 'Traveller') + '</span>' +
          '<span class="note-time">' + esc(fmtTime(n.captured_at)) + '</span>' + badges + '</div>' +
          (n.body ? '<div class="note-body">' + esc(n.body) + '</div>' : '') +
          (photos ? '<div class="note-photos">' + photos + '</div>' : '') +
          actions + '</div>';
      }).join('');
      listEl.innerHTML = html;

      // For own local (unsynced) notes without public URLs, swap in local blobs.
      list.forEach(function (n) {
        if (!n._local) return;
        var card = listEl.querySelector('[data-note="' + cssEsc(n.id) + '"]');
        if (!card) return;
        var hasRemote = (n.photo_paths || []).length && publicUrl((n.photo_paths || [])[0]);
        if (hasRemote) return;
        photosFor(n.id).then(function (ps) {
          if (!ps.length) return;
          var wrap = card.querySelector('.note-photos');
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'note-photos';
            card.appendChild(wrap);
          }
          wrap.innerHTML = localPhotoHTML(ps);
        });
      });
    });
  }

  function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

  function renderAll() {
    document.querySelectorAll('.day').forEach(renderDay);
    updateSyncStatus();
  }

  // ---------------------------------------------------------------- capture UI
  function buildDayUI(dayEl) {
    var dayKey = dayEl.dataset.date;
    var wrap = document.createElement('div');
    wrap.className = 'notes';
    var head = MODE === 'poster'
      ? '<div class="notes-head"><h4>Notes</h4>' +
        '<button class="add-note-btn" type="button">+ Add note</button></div>'
      : '<div class="notes-head"><h4>Notes</h4></div>';
    wrap.innerHTML = head + '<div class="note-list"></div>';
    dayEl.appendChild(wrap);

    if (MODE === 'poster') {
      wrap.querySelector('.add-note-btn').addEventListener('click', function () {
        openForm(dayEl, dayKey, null);
      });
    }
  }

  function openForm(dayEl, dayKey, editNote) {
    var notes = dayEl.querySelector('.notes');
    if (notes.querySelector('.note-form')) return; // one at a time
    var pending = []; // {file->blob, filename, url}
    var form = document.createElement('div');
    form.className = 'note-form';
    form.innerHTML =
      '<textarea placeholder="Tap the keyboard mic and talk, or type…">' +
      esc(editNote ? editNote.body : '') + '</textarea>' +
      '<div class="hint">Tip: tap the 🎤 on your iPhone keyboard to dictate.</div>' +
      '<div class="file-row"><input type="file" accept="image/*" multiple></div>' +
      '<div class="thumbs"></div>' +
      '<div class="form-actions"><button class="save" type="button">Save note</button>' +
      '<button class="cancel" type="button">Cancel</button></div>';
    notes.insertBefore(form, notes.querySelector('.note-list'));

    var ta = form.querySelector('textarea');
    var fileInput = form.querySelector('input[type=file]');
    var thumbs = form.querySelector('.thumbs');

    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = '';
      files.forEach(function (f) {
        shrink(f).then(function (blob) {
          var filename = uuid() + '.jpg';
          var url = URL.createObjectURL(blob);
          pending.push({ blob: blob, filename: filename, url: url });
          var img = document.createElement('img');
          img.src = url;
          thumbs.appendChild(img);
        });
      });
    });

    form.querySelector('.cancel').addEventListener('click', function () {
      form.remove();
    });

    form.querySelector('.save').addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body && !pending.length && !(editNote && (editNote.photo_paths || []).length)) {
        ta.focus(); return;
      }
      saveNote(dayKey, editNote, body, pending).then(function () {
        form.remove();
        renderDay(dayEl);
        scheduleSync();
      });
    });

    ta.focus();
  }

  function saveNote(dayKey, editNote, body, pendingPhotos) {
    var id = editNote ? editNote.id : uuid();
    var base = editNote || {
      id: id, day_key: dayKey, author: state.author || 'Traveller',
      user_id: state.uid || null, body: '', photo_paths: [],
      captured_at: nowISO(), created_at: nowISO()
    };
    base.body = body;
    base.updated_at = nowISO();
    base.synced = false;
    base.pending_op = editNote ? 'update' : 'create';
    base._local = true;

    return putNote(base).then(function () {
      var chain = Promise.resolve();
      pendingPhotos.forEach(function (p) {
        chain = chain.then(function () {
          return putPhoto({ id: uuid(), note_id: id, blob: p.blob,
            filename: p.filename, uploaded: false });
        });
      });
      return chain;
    });
  }

  function deleteNote(id) {
    return allNotes().then(function (notes) {
      var n = notes.filter(function (x) { return x.id === id; })[0];
      if (!n) {
        // remote-only own note not in local store yet — stage a delete row
        var remote = state.remote.filter(function (x) { return x.id === id; })[0];
        if (!remote) return;
        n = Object.assign({}, remote);
      }
      n.pending_op = 'delete';
      n.synced = false;
      n._local = true;
      return putNote(n);
    });
  }

  // Delegated clicks for edit / delete / lightbox
  function wireDelegation() {
    document.addEventListener('click', function (e) {
      var full = e.target.closest('.note-photos img, .note-form .thumbs img');
      if (full && full.dataset.full) { lightbox(full.dataset.full); return; }

      var del = e.target.closest('[data-del]');
      if (del) {
        if (!confirm('Delete this note? This removes its photos too.')) return;
        var dayEl = del.closest('.day');
        deleteNote(del.dataset.del).then(function () {
          renderDay(dayEl); scheduleSync();
        });
        return;
      }
      var edit = e.target.closest('[data-edit]');
      if (edit) {
        var dEl = edit.closest('.day');
        allNotes().then(function (notes) {
          var n = notes.filter(function (x) { return x.id === edit.dataset.edit; })[0];
          if (!n) {
            var r = state.remote.filter(function (x) { return x.id === edit.dataset.edit; })[0];
            n = r ? Object.assign({ _local: true }, r) : null;
          }
          if (n) openForm(dEl, n.day_key, n);
        });
      }
    });
  }

  function lightbox(url) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<img src="' + esc(url) + '" alt="photo">';
    lb.addEventListener('click', function () { lb.remove(); });
    document.body.appendChild(lb);
  }

  // ---------------------------------------------------------------- name prompt
  function promptName() {
    if (MODE !== 'poster' || state.author) return;
    var modal = document.createElement('div');
    modal.className = 'name-modal';
    modal.innerHTML =
      '<div class="box"><h3>Who’s writing?</h3>' +
      '<p>Your name goes on each note. You can change it later by clearing site data.</p>' +
      '<div class="names">' +
      '<button data-name="Marco">Marco</button>' +
      '<button data-name="Giulia">Giulia</button>' +
      '<button data-name="Vittoria">Vittoria</button></div>' +
      '<input type="text" placeholder="…or type a name" maxlength="40">' +
      '<button class="save" type="button">Save</button></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('input');
    function set(name) {
      name = (name || '').trim();
      if (!name) { input.focus(); return; }
      state.author = name;
      localStorage.setItem('travel_author', name);
      modal.remove();
    }
    modal.querySelectorAll('.names button').forEach(function (b) {
      b.addEventListener('click', function () { set(b.dataset.name); });
    });
    modal.querySelector('.save').addEventListener('click', function () { set(input.value); });
  }

  // ---------------------------------------------------------------- sync status
  function updateSyncStatus() {
    var el = document.getElementById('sync-status');
    if (!el) return;
    allNotes().then(function (notes) {
      var pend = notes.filter(function (n) { return !n.synced && n.pending_op; }).length;
      el.className = 'sync-status';
      var label;
      if (!navigator.onLine) { el.classList.add('offline'); label = 'Offline'; }
      else if (pend) { el.classList.add('pending'); label = 'Syncing ' + pend + '…'; }
      else { label = 'Synced'; }
      if (!CONFIGURED) label = 'Local only';
      el.innerHTML = '<span class="dot"></span>' + label;
    });
  }

  // ---------------------------------------------------------------- boot
  var syncTimer = null;
  function scheduleSync() { updateSyncStatus(); syncNow(); }

  function boot() {
    document.querySelectorAll('.day').forEach(buildDayUI);
    wireDelegation();
    initSupabase();

    if (MODE === 'poster') {
      promptName();
      ensureAuth().then(function () { renderAll(); syncNow(); });
      window.addEventListener('online', syncNow);
      window.addEventListener('offline', updateSyncStatus);
      syncTimer = setInterval(function () {
        if (navigator.onLine) syncNow();
      }, 20000);
    } else {
      // reader: display only, never signs in
      renderAll();
      if (navigator.onLine) fetchRemote();
      window.addEventListener('online', fetchRemote);
      setInterval(function () { if (navigator.onLine) fetchRemote(); }, 60000);
    }
    renderAll();
  }

  if (document.querySelector('.day')) boot();
  else document.addEventListener('itinerary:ready', boot, { once: true });
})();

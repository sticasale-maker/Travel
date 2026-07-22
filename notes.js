/* notes.js — offline-first travel JOURNAL for the Outback Loop PWA.
   Poster (index.html): capture + sync + display.  Reader (read.html): display only.

   Language: entries store body_en / body_it. The Edge Function auto-detects the
   language written and fills both; display picks the UI language, falling back to
   the original + a "Translated" tag. Each person has a profile (name + avatar),
   shown beside every entry.

   Storage: IndexedDB holds this device's entries + pending photo blobs, so capture
   works offline and survives restarts. A sync engine pushes to Supabase when online. */
(function () {
  'use strict';

  var ORDER = 'asc'; // oldest-first within a day (reads like a diary)

  var MODE = window.TRAVEL_MODE === 'reader' ? 'reader' : 'poster';
  var CFG = window.TRAVEL_CONFIG || {};
  var I18N = window.I18N;
  var CONFIGURED = CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 &&
                   CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY.indexOf('YOUR-') === -1;
  var BUCKET = 'travel-photos';

  var state = {
    sb: null, uid: null,
    author: localStorage.getItem('travel_author') || '',
    remote: [], profiles: {}, syncing: false, attempts: {}, booted: false
  };

  function t(k, v) { return I18N ? I18N.t(k, v) : k; }
  function lang() { return I18N ? I18N.lang : 'en'; }

  // ---------------------------------------------------------------- helpers
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
    });
  }
  function nowISO() { return new Date().toISOString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(I18N ? I18N.locale() : 'en-AU',
      { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function cssEsc(s) { return String(s).replace(/"/g, '\\"'); }

  function pickBody(n) {
    var ui = lang();
    var col = ui === 'it' ? n.body_it : n.body_en;
    if (col && col.trim()) return { text: col, translated: !!(n.lang && n.lang !== ui) };
    var orig = n.body || n.body_en || n.body_it || '';
    return { text: orig, translated: false };
  }

  // ------- avatars -------
  function initial(name) { name = (name || '').trim(); return (name ? name[0] : '?').toUpperCase(); }
  function avatarColor(name) {
    var h = 0; name = name || '?';
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',42%,42%)';
  }
  function displayName(n) {
    var p = state.profiles[n.user_id];
    if (p && p.name) return p.name;
    if (n.author) return n.author;
    if (myNote(n) && state.author) return state.author;
    return 'Traveller';
  }
  function noteAvatarURL(n) {
    if (myNote(n)) {
      var d = localStorage.getItem('travel_avatar_data');
      if (d) return d;
    }
    var p = state.profiles[n.user_id];
    if (p && p.avatar_path) return publicUrl(p.avatar_path);
    return '';
  }
  function avatarHTML(url, name, cls) {
    if (url) return '<span class="avatar ' + (cls || '') + '"><img src="' + esc(url) + '" alt=""></span>';
    return '<span class="avatar init ' + (cls || '') + '" style="background:' + avatarColor(name) + '">' +
      esc(initial(name)) + '</span>';
  }

  function dataURLtoBlob(d) {
    var parts = d.split(','), mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ---------------------------------------------------------------- IndexedDB
  var DB = null;
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (DB) return resolve(DB);
      var req = indexedDB.open('travel-notes-db', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos'))
          db.createObjectStore('photos', { keyPath: 'id' }).createIndex('note_id', 'note_id', { unique: false });
      };
      req.onsuccess = function () { DB = req.result; resolve(DB); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(s, m) { return openDB().then(function (db) { return db.transaction(s, m).objectStore(s); }); }
  function idbReq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function putNote(n) { return tx('notes', 'readwrite').then(function (s) { return idbReq(s.put(n)); }); }
  function delNote(id) { return tx('notes', 'readwrite').then(function (s) { return idbReq(s.delete(id)); }); }
  function allNotes() { return tx('notes', 'readonly').then(function (s) { return idbReq(s.getAll()); }); }
  function putPhoto(p) { return tx('photos', 'readwrite').then(function (s) { return idbReq(s.put(p)); }); }
  function delPhoto(id) { return tx('photos', 'readwrite').then(function (s) { return idbReq(s.delete(id)); }); }
  function photosFor(id) { return tx('photos', 'readonly').then(function (s) { return idbReq(s.index('note_id').getAll(id)); }); }

  // ---------------------------------------------------------------- images
  function shrink(file) {
    var maxDim = CFG.PHOTO_MAX_DIM || 1600, quality = CFG.PHOTO_JPEG_QUALITY || 0.7;
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { resolve(blob || file); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  // Square centre-crop to 256px, as a data URL (small enough for localStorage).
  function shrinkAvatar(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight);
        var sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2, d = 256;
        var c = document.createElement('canvas'); c.width = d; c.height = d;
        c.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, d, d);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- Supabase
  function initSupabase() {
    if (!CONFIGURED || !window.supabase || !window.supabase.createClient) return;
    state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  function ensureAuth() {
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
    if (!state.sb || !path) return '';
    return state.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  function fetchRemote() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('travel_notes').select('*').order('captured_at', { ascending: true })
      .then(function (res) { if (!res.error && res.data) { state.remote = res.data; renderAll(); backfillTranslations(res.data); } })
      .catch(function () {});
  }

  // Self-healing: any synced entry missing a language gets (re)translated. Fires
  // the Edge Function once per note per session; harmless no-op if it isn't
  // deployed. Lets old entries fill in automatically once translation is live.
  var _tried = {};
  function backfillTranslations(rows) {
    if (MODE !== 'poster' || !state.sb || !state.uid || !navigator.onLine) return;
    rows.forEach(function (n) {
      var body = (n.body || n.body_en || n.body_it || '').trim();
      if (!body) return;
      if ((n.body_en || '').trim() && (n.body_it || '').trim()) return; // both present
      if (_tried[n.id]) return;
      _tried[n.id] = 1;
      state.sb.functions.invoke('translate-note', { body: { id: n.id } }).catch(function () {});
    });
  }
  function fetchProfiles() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('profiles').select('*')
      .then(function (res) {
        if (!res.error && res.data) {
          var m = {}; res.data.forEach(function (p) { m[p.user_id] = p; });
          state.profiles = m; renderAll();
        }
      }).catch(function () {});
  }

  // ------- profile sync (upload avatar + upsert row) -------
  function syncProfile() {
    if (MODE !== 'poster' || !state.sb || !state.uid) return Promise.resolve();
    if (localStorage.getItem('travel_avatar_synced') === '1') return Promise.resolve();
    var name = state.author || 'Traveller';
    var dataUrl = localStorage.getItem('travel_avatar_data');
    var path = localStorage.getItem('travel_avatar_path') || '';
    var chain = Promise.resolve();
    if (dataUrl && !path) {
      var blob = dataURLtoBlob(dataUrl);
      path = state.uid + '/avatar/' + uuid() + '.jpg';
      chain = state.sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        .then(function (res) { if (res.error) throw res.error; localStorage.setItem('travel_avatar_path', path); })
        .catch(function () { path = ''; });
    }
    return chain.then(function () {
      return state.sb.from('profiles').upsert({ user_id: state.uid, name: name, avatar_path: path, updated_at: nowISO() });
    }).then(function (res) {
      if (res && !res.error) localStorage.setItem('travel_avatar_synced', '1');
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- sync
  function backoffReady(id) { var a = state.attempts[id]; return !a || Date.now() >= a.nextTry; }
  function noteFailed(id) { var a = state.attempts[id] || { count: 0 }; a.count += 1; a.nextTry = Date.now() + Math.min(5 * 60000, 5000 * Math.pow(2, a.count - 1)); state.attempts[id] = a; }
  function noteOK(id) { delete state.attempts[id]; }

  function syncNote(n) {
    if (n.pending_op === 'delete') {
      var paths = n.photo_paths || [];
      var rm = paths.length ? state.sb.storage.from(BUCKET).remove(paths).catch(function () {}) : Promise.resolve();
      return rm.then(function () { return state.sb.from('travel_notes').delete().eq('id', n.id); })
        .then(function (res) {
          if (res.error) throw res.error;
          return photosFor(n.id).then(function (ps) { return Promise.all(ps.map(function (p) { return delPhoto(p.id); })); })
            .then(function () { return delNote(n.id); });
        });
    }
    return photosFor(n.id).then(function (photos) {
      var pending = photos.filter(function (p) { return !p.uploaded; });
      var paths = (n.photo_paths || []).slice();
      var chain = Promise.resolve();
      pending.forEach(function (p) {
        chain = chain.then(function () {
          var path = state.uid + '/' + n.id + '/' + p.filename;
          return state.sb.storage.from(BUCKET).upload(path, p.blob, { contentType: 'image/jpeg', upsert: true })
            .then(function (res) { if (res.error) throw res.error; if (paths.indexOf(path) === -1) paths.push(path); p.uploaded = true; p.path = path; return putPhoto(p); });
        });
      });
      return chain.then(function () {
        n.photo_paths = paths;
        var row = {
          id: n.id, day_key: n.day_key, author: n.author || state.author || 'Traveller',
          user_id: state.uid, lang: n.lang || lang(),
          body: n.body || '', body_en: n.body_en || '', body_it: n.body_it || '',
          photo_paths: paths, captured_at: n.captured_at, updated_at: nowISO()
        };
        return state.sb.from('travel_notes').upsert(row).then(function (res) {
          if (res.error) throw res.error;
          n.synced = true; n.pending_op = null; n.user_id = state.uid;
          return putNote(n).then(function () {
            if (row.body) return state.sb.functions.invoke('translate-note', { body: { id: n.id } }).catch(function () {});
          });
        });
      });
    });
  }

  function syncNow() {
    if (MODE !== 'poster' || !state.sb || state.syncing || !navigator.onLine) return Promise.resolve();
    state.syncing = true;
    return ensureAuth().then(function () {
      if (!state.uid) return;
      return syncProfile().then(function () {
        return allNotes().then(function (notes) {
          var pending = notes.filter(function (n) { return !n.synced && n.pending_op; })
            .filter(function (n) { return backoffReady(n.id); })
            .sort(function (a, b) { return (a.captured_at || '').localeCompare(b.captured_at || ''); });
          var chain = Promise.resolve();
          pending.forEach(function (n) {
            chain = chain.then(function () { return syncNote(n).then(function () { noteOK(n.id); }).catch(function () { noteFailed(n.id); }); });
          });
          return chain;
        });
      });
    }).then(function () { return Promise.all([fetchRemote(), fetchProfiles()]); })
      .catch(function () {}).then(function () { state.syncing = false; renderAll(); });
  }

  // ---------------------------------------------------------------- rendering
  function myNote(n) { return n._local || (state.uid && n.user_id === state.uid); }

  function mergedForDay(dayKey, localNotes) {
    var deleted = {}, map = {};
    localNotes.forEach(function (n) {
      if (n.day_key !== dayKey) return;
      if (n.pending_op === 'delete') { deleted[n.id] = 1; return; }
      var m = Object.assign({}, n); m._local = true; m._pending = !n.synced; map[n.id] = m;
    });
    // Remote is authoritative for already-synced entries (it carries the
    // translations the Edge Function added); pending local edits still win.
    state.remote.forEach(function (n) {
      if (n.day_key !== dayKey || deleted[n.id]) return;
      var ex = map[n.id];
      if (ex && ex._pending) return;
      map[n.id] = n;
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) { var c = (a.captured_at || '').localeCompare(b.captured_at || ''); return ORDER === 'asc' ? c : -c; });
    return list;
  }

  function photoHTML(n) {
    var out = '';
    (n.photo_paths || []).forEach(function (p) { var url = publicUrl(p); if (url) out += '<img loading="lazy" src="' + esc(url) + '" data-full="' + esc(url) + '" alt="">'; });
    return out;
  }
  function localPhotoHTML(photos) {
    var out = ''; (photos || []).forEach(function (p) { var url = URL.createObjectURL(p.blob); out += '<img src="' + url + '" data-full="' + url + '" alt="">'; }); return out;
  }

  function renderDay(dayEl) {
    var dayKey = dayEl.dataset.date;
    var listEl = dayEl.querySelector('.note-list');
    if (!listEl) return;
    allNotes().then(function (locals) {
      var list = mergedForDay(dayKey, locals);
      if (!list.length) {
        listEl.innerHTML = '<div class="note-empty">' + t(MODE === 'poster' ? 'empty_poster' : 'empty_reader') + '</div>';
        return;
      }
      var html = list.map(function (n) {
        var mine = myNote(n), body = pickBody(n), name = displayName(n), av = noteAvatarURL(n);
        var badges = '';
        if (n._pending) badges += '<span class="note-badge pending">' + esc(t('badge_pending')) + '</span>';
        else if (MODE === 'poster' && mine) badges += '<span class="note-badge mine">' + esc(t('badge_you')) + '</span>';
        if (body.translated) badges += '<span class="note-badge tr">' + esc(t('translated_from')) + '</span>';
        var actions = '';
        if (MODE === 'poster' && mine) {
          actions = '<div class="note-actions">' +
            '<button class="edit" data-edit="' + esc(n.id) + '">' + esc(t('edit')) + '</button>' +
            '<button class="del" data-del="' + esc(n.id) + '">' + esc(t('del')) + '</button></div>';
        }
        return '<div class="note-card" data-note="' + esc(n.id) + '">' +
          '<div class="note-meta">' + avatarHTML(av, name) +
          '<div class="note-meta-main"><span class="note-author">' + esc(name) + '</span>' +
          '<span class="note-time">' + esc(fmtTime(n.captured_at)) + '</span>' + badges + '</div></div>' +
          (body.text ? '<div class="note-body">' + esc(body.text) + '</div>' : '') +
          (photoHTML(n) ? '<div class="note-photos">' + photoHTML(n) + '</div>' : '') +
          actions + '</div>';
      }).join('');
      listEl.innerHTML = html;

      list.forEach(function (n) {
        if (!n._local) return;
        var card = listEl.querySelector('[data-note="' + cssEsc(n.id) + '"]');
        if (!card) return;
        if ((n.photo_paths || []).length && publicUrl((n.photo_paths || [])[0])) return;
        photosFor(n.id).then(function (ps) {
          if (!ps.length) return;
          var wrap = card.querySelector('.note-photos');
          if (!wrap) { wrap = document.createElement('div'); wrap.className = 'note-photos'; card.appendChild(wrap); }
          wrap.innerHTML = localPhotoHTML(ps);
        });
      });
    });
  }

  function renderAll() { document.querySelectorAll('.day').forEach(renderDay); updateSyncStatus(); renderProfileChip(); }

  // ---------------------------------------------------------------- capture UI
  function buildDayUI(dayEl) {
    if (dayEl.querySelector('.notes')) return;
    var dayKey = dayEl.dataset.date;
    var wrap = document.createElement('div');
    wrap.className = 'notes';
    wrap.innerHTML = MODE === 'poster'
      ? '<div class="notes-head"><h4>' + esc(t('journal_title')) + '</h4>' +
        '<button class="add-note-btn" type="button">' + esc(t('add_memory')) + '</button></div><div class="note-list"></div>'
      : '<div class="notes-head"><h4>' + esc(t('journal_title')) + '</h4></div><div class="note-list"></div>';
    dayEl.appendChild(wrap);
    if (MODE === 'poster') wrap.querySelector('.add-note-btn').addEventListener('click', function () { openForm(dayEl, dayKey, null); });
  }

  function openForm(dayEl, dayKey, editNote) {
    var notes = dayEl.querySelector('.notes');
    if (notes.querySelector('.note-form')) return;
    var pending = [];
    var form = document.createElement('div');
    form.className = 'note-form';
    var editText = editNote ? (editNote.body || pickBody(editNote).text || '') : '';
    form.innerHTML =
      '<textarea placeholder="' + esc(t('form_placeholder')) + '">' + esc(editText) + '</textarea>' +
      '<div class="hint">' + esc(t('form_hint')) + '</div>' +
      '<div class="file-row"><input type="file" accept="image/*" multiple></div>' +
      '<div class="thumbs"></div>' +
      '<div class="form-actions"><button class="save" type="button">' + esc(t('save_memory')) + '</button>' +
      '<button class="cancel" type="button">' + esc(t('cancel')) + '</button></div>';
    notes.insertBefore(form, notes.querySelector('.note-list'));
    var ta = form.querySelector('textarea'), fileInput = form.querySelector('input[type=file]'), thumbs = form.querySelector('.thumbs');
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []); fileInput.value = '';
      files.forEach(function (f) { shrink(f).then(function (blob) { var filename = uuid() + '.jpg', url = URL.createObjectURL(blob); pending.push({ blob: blob, filename: filename, url: url }); var img = document.createElement('img'); img.src = url; thumbs.appendChild(img); }); });
    });
    form.querySelector('.cancel').addEventListener('click', function () { form.remove(); });
    form.querySelector('.save').addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body && !pending.length && !(editNote && (editNote.photo_paths || []).length)) { ta.focus(); return; }
      saveNote(dayKey, editNote, body, pending).then(function () { form.remove(); renderDay(dayEl); scheduleSync(); });
    });
    ta.focus();
  }

  function saveNote(dayKey, editNote, body, pendingPhotos) {
    var id = editNote ? editNote.id : uuid();
    var base = editNote || {
      id: id, day_key: dayKey, author: state.author || 'Traveller', user_id: state.uid || null,
      photo_paths: [], captured_at: nowISO(), created_at: nowISO()
    };
    base.author = state.author || base.author || 'Traveller';
    base.body = body;
    // Clear both language columns; the server auto-detects and fills them.
    base.body_en = ''; base.body_it = ''; base.lang = lang();
    base.updated_at = nowISO();
    base.synced = false;
    base.pending_op = editNote ? 'update' : 'create';
    base._local = true;
    return putNote(base).then(function () {
      var chain = Promise.resolve();
      pendingPhotos.forEach(function (p) { chain = chain.then(function () { return putPhoto({ id: uuid(), note_id: id, blob: p.blob, filename: p.filename, uploaded: false }); }); });
      return chain;
    });
  }

  function deleteNote(id) {
    return allNotes().then(function (notes) {
      var n = notes.filter(function (x) { return x.id === id; })[0];
      if (!n) { var remote = state.remote.filter(function (x) { return x.id === id; })[0]; if (!remote) return; n = Object.assign({}, remote); }
      n.pending_op = 'delete'; n.synced = false; n._local = true; return putNote(n);
    });
  }

  function wireDelegation() {
    document.addEventListener('click', function (e) {
      var full = e.target.closest('.note-photos img, .note-form .thumbs img');
      if (full && full.dataset.full) { lightbox(full.dataset.full); return; }
      var del = e.target.closest('[data-del]');
      if (del) { if (!confirm(t('confirm_delete'))) return; var dayEl = del.closest('.day'); deleteNote(del.dataset.del).then(function () { renderDay(dayEl); scheduleSync(); }); return; }
      var edit = e.target.closest('[data-edit]');
      if (edit) {
        var dEl = edit.closest('.day');
        allNotes().then(function (notes) {
          var n = notes.filter(function (x) { return x.id === edit.dataset.edit; })[0];
          if (!n) { var r = state.remote.filter(function (x) { return x.id === edit.dataset.edit; })[0]; n = r ? Object.assign({ _local: true }, r) : null; }
          if (n) openForm(dEl, n.day_key, n);
        });
      }
      var chip = e.target.closest('#profile-chip');
      if (chip) openProfile(false);
    });
  }

  function lightbox(url) {
    var lb = document.createElement('div'); lb.className = 'lightbox';
    lb.innerHTML = '<img src="' + esc(url) + '" alt="">';
    lb.addEventListener('click', function () { lb.remove(); });
    document.body.appendChild(lb);
  }

  // ---------------------------------------------------------------- profile editor
  function openProfile(force) {
    if (MODE !== 'poster') return;
    var avatarData = localStorage.getItem('travel_avatar_data') || '';
    var name = state.author || '';
    var modal = document.createElement('div');
    modal.className = 'name-modal';
    modal.innerHTML =
      '<div class="box"><h3>' + esc(t('name_title')) + '</h3>' +
      '<p>' + esc(t('name_desc')) + '</p>' +
      '<div class="avatar-pick">' +
        '<span class="avatar-slot">' + avatarHTML(avatarData, name || '?') + '</span>' +
        '<label>' + esc(t(avatarData ? 'change_photo' : 'add_photo')) +
          '<input type="file" accept="image/*"></label>' +
      '</div>' +
      '<div class="names">' +
      '<button data-name="Marco">Marco</button><button data-name="Giulia">Giulia</button>' +
      '<button data-name="Vittoria">Vittoria</button><button data-name="Luca">Luca</button></div>' +
      '<input type="text" class="name-in" placeholder="' + esc(t('name_ph')) + '" maxlength="40" value="' + esc(name) + '">' +
      '<button class="save" type="button">' + esc(t('name_save')) + '</button></div>';
    document.body.appendChild(modal);
    var newAvatar = avatarData, changed = false;
    var slot = modal.querySelector('.avatar-slot');
    var nameIn = modal.querySelector('.name-in');
    function refreshSlot() { slot.innerHTML = avatarHTML(newAvatar, (nameIn.value || '?')); }

    modal.querySelector('.avatar-pick input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      shrinkAvatar(f).then(function (d) { if (d) { newAvatar = d; changed = true; refreshSlot(); modal.querySelector('.avatar-pick label').childNodes[0].nodeValue = t('change_photo'); } });
    });
    modal.querySelectorAll('.names button').forEach(function (b) {
      b.addEventListener('click', function () { nameIn.value = b.dataset.name; refreshSlot(); });
    });
    nameIn.addEventListener('input', refreshSlot);

    modal.querySelector('.save').addEventListener('click', function () {
      var nm = (nameIn.value || '').trim();
      if (!nm) { nameIn.focus(); return; }
      state.author = nm; localStorage.setItem('travel_author', nm);
      if (changed) {
        localStorage.setItem('travel_avatar_data', newAvatar);
        localStorage.removeItem('travel_avatar_path');
      }
      if (changed || nm) localStorage.removeItem('travel_avatar_synced');
      modal.remove();
      renderProfileChip(); renderAll(); scheduleSync();
    });

    if (!force) {
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    }
  }

  function renderProfileChip() {
    var host = document.getElementById('profile-chip');
    if (!host || MODE !== 'poster') return;
    if (!state.author) { host.style.display = 'none'; return; }
    host.style.display = 'inline-flex';
    var av = localStorage.getItem('travel_avatar_data') || '';
    host.innerHTML = avatarHTML(av, state.author) + '<span class="pname">' + esc(state.author) + '</span>';
  }

  // ---------------------------------------------------------------- sync status
  function updateSyncStatus() {
    var el = document.getElementById('sync-status');
    if (!el) return;
    allNotes().then(function (notes) {
      var pend = notes.filter(function (n) { return !n.synced && n.pending_op; }).length;
      el.className = 'sync-status'; var label;
      if (!CONFIGURED) label = t('sync_local');
      else if (!navigator.onLine) { el.classList.add('offline'); label = t('sync_offline'); }
      else if (pend) { el.classList.add('pending'); label = t('sync_syncing', { n: pend }); }
      else label = t('sync_synced');
      el.innerHTML = '<span class="dot"></span>' + esc(label);
    });
  }

  // ---------------------------------------------------------------- boot
  function scheduleSync() { updateSyncStatus(); syncNow(); }
  function mount() { document.querySelectorAll('.day').forEach(buildDayUI); renderAll(); }

  function initOnce() {
    if (state.booted) return;
    state.booted = true;
    wireDelegation();
    initSupabase();
    if (MODE === 'poster') {
      if (!state.author) openProfile(true);
      ensureAuth().then(function () { fetchProfiles(); renderAll(); syncNow(); });
      window.addEventListener('online', syncNow);
      window.addEventListener('offline', updateSyncStatus);
      setInterval(function () { if (navigator.onLine) syncNow(); }, 20000);
    } else {
      if (navigator.onLine) { fetchRemote(); fetchProfiles(); }
      window.addEventListener('online', function () { fetchRemote(); fetchProfiles(); });
      setInterval(function () { if (navigator.onLine) { fetchRemote(); fetchProfiles(); } }, 60000);
    }
  }

  document.addEventListener('itinerary:ready', function () { mount(); initOnce(); });
  if (document.querySelector('.day')) { mount(); initOnce(); }
})();

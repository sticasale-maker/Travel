/* notes.js — offline-first travel JOURNAL for the Outback Loop PWA.
   Poster (index.html): capture + sync + display.  Reader (read.html): display only.

   People: the phone can hold several people (name + avatar), so one device can
   post on behalf of family members who don't have their own phone. Each entry
   carries its author's name + avatar, so the right person shows regardless of
   which device/uid saved it. You pick who's writing per entry.

   Language: entries store body_en / body_it (Edge Function auto-detects + fills
   both); display picks the UI language, else the original + a "Translated" tag.

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

  var state = { sb: null, uid: null, remote: [], profiles: {}, syncing: false, attempts: {}, booted: false };

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
    return { text: n.body || n.body_en || n.body_it || '', translated: false };
  }

  // ------- people (multiple per device) -------
  function loadPeople() { try { return JSON.parse(localStorage.getItem('travel_people') || '[]'); } catch (e) { return []; } }
  function savePeople(a) { localStorage.setItem('travel_people', JSON.stringify(a)); }
  function personById(id) { return loadPeople().filter(function (p) { return p.id === id; })[0] || null; }
  function activeId() { return localStorage.getItem('travel_active') || ''; }
  function setActive(id) { localStorage.setItem('travel_active', id); }
  function activePerson() { return personById(activeId()) || loadPeople()[0] || null; }
  function upsertPerson(p) {
    var a = loadPeople(), i = -1;
    a.forEach(function (x, idx) { if (x.id === p.id) i = idx; });
    if (i >= 0) a[i] = p; else a.push(p);
    savePeople(a);
  }
  function removePerson(id) {
    var a = loadPeople().filter(function (p) { return p.id !== id; });
    savePeople(a);
    if (activeId() === id) setActive(a[0] ? a[0].id : '');
  }
  // one-time migration from the old single-profile keys
  function migratePeople() {
    if (localStorage.getItem('travel_people')) return;
    var people = [], oldName = localStorage.getItem('travel_author');
    if (oldName) people.push({ id: uuid(), name: oldName,
      avatarData: localStorage.getItem('travel_avatar_data') || '',
      avatarPath: localStorage.getItem('travel_avatar_path') || '' });
    savePeople(people);
    if (people.length) setActive(people[0].id);
  }

  // ------- avatars -------
  function initial(name) { name = (name || '').trim(); return (name ? name[0] : '?').toUpperCase(); }
  function avatarColor(name) {
    var h = 0; name = name || '?';
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',42%,42%)';
  }
  function displayName(n) {
    if (n.author) return n.author;
    var p = state.profiles[n.user_id];
    return (p && p.name) || 'Traveller';
  }
  function noteAvatarURL(n) {
    if (n.avatar_path) return publicUrl(n.avatar_path);
    if (n._local && n.avatar_data) return n.avatar_data;
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
  function shrinkAvatar(file) { // square centre-crop, 256px, data URL
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
  var _tried = {};
  function backfillTranslations(rows) {
    if (MODE !== 'poster' || !state.sb || !state.uid || !navigator.onLine) return;
    rows.forEach(function (n) {
      var body = (n.body || n.body_en || n.body_it || '').trim();
      if (!body) return;
      if ((n.body_en || '').trim() && (n.body_it || '').trim()) return;
      if (_tried[n.id]) return;
      _tried[n.id] = 1;
      state.sb.functions.invoke('translate-note', { body: { id: n.id } }).catch(function () {});
    });
  }
  function fetchProfiles() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('profiles').select('*')
      .then(function (res) {
        if (!res.error && res.data) { var m = {}; res.data.forEach(function (p) { m[p.user_id] = p; }); state.profiles = m; renderAll(); }
      }).catch(function () {});
  }

  // Upload each person's avatar that isn't uploaded yet; record its storage path.
  function uploadAvatars() {
    if (!state.sb || !state.uid) return Promise.resolve();
    var people = loadPeople(), chain = Promise.resolve(), dirty = false;
    people.forEach(function (p) {
      if (!p.avatarData || p.avatarPath) return;
      chain = chain.then(function () {
        var path = state.uid + '/avatar/' + p.id + '.jpg';
        return state.sb.storage.from(BUCKET).upload(path, dataURLtoBlob(p.avatarData), { contentType: 'image/jpeg', upsert: true })
          .then(function (res) { if (!res.error) { p.avatarPath = path; dirty = true; } })
          .catch(function () {});
      });
    });
    return chain.then(function () { if (dirty) savePeople(people); });
  }

  // ---------------------------------------------------------------- sync
  function backoffReady(id) { var a = state.attempts[id]; return !a || Date.now() >= a.nextTry; }
  function noteFailed(id) { var a = state.attempts[id] || { count: 0 }; a.count += 1; a.nextTry = Date.now() + Math.min(5 * 60000, 5000 * Math.pow(2, a.count - 1)); state.attempts[id] = a; }
  function noteOK(id) { delete state.attempts[id]; }

  // upsert a row; if the DB doesn't have avatar_path yet, retry without it so
  // posting never breaks before the one-line ALTER is run.
  function upsertRow(row) {
    return state.sb.from('travel_notes').upsert(row).then(function (res) {
      if (res.error && row.avatar_path !== undefined &&
          (/avatar_path/.test(res.error.message || '') || res.error.code === 'PGRST204')) {
        var r2 = Object.assign({}, row); delete r2.avatar_path;
        return state.sb.from('travel_notes').upsert(r2);
      }
      return res;
    });
  }

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
        // fill the author's avatar path (uploaded above) if we didn't have it yet
        if (!n.avatar_path && n.person_key) { var pr = personById(n.person_key); if (pr && pr.avatarPath) n.avatar_path = pr.avatarPath; }
        var row = {
          id: n.id, day_key: n.day_key, author: n.author || 'Traveller',
          user_id: state.uid, lang: n.lang || lang(),
          body: n.body || '', body_en: n.body_en || '', body_it: n.body_it || '',
          photo_paths: paths, captured_at: n.captured_at, updated_at: nowISO(),
          avatar_path: n.avatar_path || ''
        };
        return upsertRow(row).then(function (res) {
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
      return uploadAvatars().then(function () {
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
    var selectedId = editNote ? (editNote.person_key || '') : (activePerson() ? activePerson().id : '');
    var form = document.createElement('div');
    form.className = 'note-form';
    var editText = editNote ? (editNote.body || pickBody(editNote).text || '') : '';
    // "Writing as" picker (new entries only)
    var picker = editNote ? '' :
      '<div class="post-as"><span class="pa-label">' + esc(t('posting_as')) + '</span><div class="pa-people"></div></div>';
    form.innerHTML = picker +
      '<textarea placeholder="' + esc(t('form_placeholder')) + '">' + esc(editText) + '</textarea>' +
      '<div class="hint">' + esc(t('form_hint')) + '</div>' +
      '<div class="file-row"><input type="file" accept="image/*" multiple></div>' +
      '<div class="thumbs"></div>' +
      '<div class="form-actions"><button class="save" type="button">' + esc(t('save_memory')) + '</button>' +
      '<button class="cancel" type="button">' + esc(t('cancel')) + '</button></div>';
    notes.insertBefore(form, notes.querySelector('.note-list'));

    function renderPicker() {
      var host = form.querySelector('.pa-people'); if (!host) return;
      var people = loadPeople();
      host.innerHTML = people.map(function (p) {
        return '<button type="button" class="pa-chip' + (p.id === selectedId ? ' on' : '') + '" data-pid="' + esc(p.id) + '">' +
          avatarHTML(p.avatarData || (p.avatarPath ? publicUrl(p.avatarPath) : ''), p.name) +
          '<span>' + esc(p.name) + '</span></button>';
      }).join('') + '<button type="button" class="pa-chip pa-add" data-add="1">' + esc(t('add_person')) + '</button>';
      host.querySelectorAll('.pa-chip[data-pid]').forEach(function (b) {
        b.addEventListener('click', function () { selectedId = b.dataset.pid; renderPicker(); });
      });
      host.querySelector('[data-add]').addEventListener('click', function () {
        openPerson(null, function (newId) { selectedId = newId; renderPicker(); });
      });
    }
    if (!editNote) renderPicker();

    var ta = form.querySelector('textarea'), fileInput = form.querySelector('input[type=file]'), thumbs = form.querySelector('.thumbs');
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []); fileInput.value = '';
      files.forEach(function (f) { shrink(f).then(function (blob) { var filename = uuid() + '.jpg', url = URL.createObjectURL(blob); pending.push({ blob: blob, filename: filename, url: url }); var img = document.createElement('img'); img.src = url; thumbs.appendChild(img); }); });
    });
    form.querySelector('.cancel').addEventListener('click', function () { form.remove(); });
    form.querySelector('.save').addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body && !pending.length && !(editNote && (editNote.photo_paths || []).length)) { ta.focus(); return; }
      var person = editNote ? null : (personById(selectedId) || activePerson());
      if (!editNote && person) setActive(person.id); // remember last writer
      saveNote(dayKey, editNote, body, pending, person).then(function () { form.remove(); renderDay(dayEl); scheduleSync(); });
    });
    ta.focus();
  }

  function saveNote(dayKey, editNote, body, pendingPhotos, person) {
    var id = editNote ? editNote.id : uuid();
    var base;
    if (editNote) {
      base = editNote; // keep original author / avatar
    } else {
      var pr = person || { name: 'Traveller', id: '', avatarData: '', avatarPath: '' };
      base = {
        id: id, day_key: dayKey, user_id: state.uid || null,
        author: pr.name, person_key: pr.id || '',
        avatar_data: pr.avatarData || '', avatar_path: pr.avatarPath || '',
        photo_paths: [], captured_at: nowISO(), created_at: nowISO()
      };
    }
    base.body = body;
    base.body_en = ''; base.body_it = ''; base.lang = lang(); // server auto-detects
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
      if (e.target.closest('#profile-chip')) openSwitcher();
    });
  }

  function lightbox(url) {
    var lb = document.createElement('div'); lb.className = 'lightbox';
    lb.innerHTML = '<img src="' + esc(url) + '" alt="">';
    lb.addEventListener('click', function () { lb.remove(); });
    document.body.appendChild(lb);
  }

  // ---------------------------------------------------------------- people UI
  // Switcher: choose who is active, add/edit people.
  function openSwitcher() {
    if (MODE !== 'poster') return;
    var modal = document.createElement('div');
    modal.className = 'name-modal';
    var people = loadPeople();
    modal.innerHTML = '<div class="box"><h3>' + esc(t('whos_writing')) + '</h3>' +
      '<div class="people-list">' + people.map(function (p) {
        return '<div class="person-row' + (p.id === activeId() ? ' on' : '') + '" data-pick="' + esc(p.id) + '">' +
          avatarHTML(p.avatarData || (p.avatarPath ? publicUrl(p.avatarPath) : ''), p.name) +
          '<span class="prname">' + esc(p.name) + '</span>' +
          '<button type="button" class="pr-edit" data-edit-person="' + esc(p.id) + '">' + esc(t('edit')) + '</button></div>';
      }).join('') + '</div>' +
      '<button class="add-person-btn" type="button">' + esc(t('add_person')) + '</button></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('.person-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit-person]')) return;
        setActive(row.dataset.pick); modal.remove(); renderProfileChip();
      });
    });
    modal.querySelectorAll('[data-edit-person]').forEach(function (b) {
      b.addEventListener('click', function () { modal.remove(); openPerson(b.dataset.editPerson); });
    });
    modal.querySelector('.add-person-btn').addEventListener('click', function () { modal.remove(); openPerson(null); });
  }

  // Person editor: add (id=null) or edit an existing person.
  function openPerson(id, onSaved) {
    if (MODE !== 'poster') return;
    var existing = id ? personById(id) : null;
    var pid = existing ? existing.id : uuid();
    var name = existing ? existing.name : '';
    var newAvatar = existing ? (existing.avatarData || '') : '';
    var changed = false;
    var modal = document.createElement('div');
    modal.className = 'name-modal';
    modal.innerHTML = '<div class="box"><h3>' + esc(t(existing ? 'person_edit' : 'person_new')) + '</h3>' +
      '<p>' + esc(t('name_desc')) + '</p>' +
      '<div class="avatar-pick"><span class="avatar-slot">' + avatarHTML(newAvatar, name || '?') + '</span>' +
      '<label>' + esc(t(newAvatar ? 'change_photo' : 'add_photo')) + '<input type="file" accept="image/*"></label></div>' +
      '<div class="names"><button data-name="Marco">Marco</button><button data-name="Giulia">Giulia</button>' +
      '<button data-name="Vittoria">Vittoria</button><button data-name="Luca">Luca</button></div>' +
      '<input type="text" class="name-in" placeholder="' + esc(t('name_ph')) + '" maxlength="40" value="' + esc(name) + '">' +
      '<button class="save" type="button">' + esc(t('name_save')) + '</button>' +
      (existing && loadPeople().length > 1 ? '<button class="remove-person" type="button">' + esc(t('remove_person')) + '</button>' : '') +
      '</div>';
    document.body.appendChild(modal);
    var slot = modal.querySelector('.avatar-slot'), nameIn = modal.querySelector('.name-in');
    function refreshSlot() { slot.innerHTML = avatarHTML(newAvatar, (nameIn.value || '?')); }
    modal.querySelector('.avatar-pick input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      shrinkAvatar(f).then(function (d) { if (d) { newAvatar = d; changed = true; refreshSlot(); modal.querySelector('.avatar-pick label').childNodes[0].nodeValue = t('change_photo'); } });
    });
    modal.querySelectorAll('.names button').forEach(function (b) { b.addEventListener('click', function () { nameIn.value = b.dataset.name; refreshSlot(); }); });
    nameIn.addEventListener('input', refreshSlot);
    modal.querySelector('.save').addEventListener('click', function () {
      var nm = (nameIn.value || '').trim();
      if (!nm) { nameIn.focus(); return; }
      var person = { id: pid, name: nm,
        avatarData: newAvatar,
        avatarPath: (existing && !changed) ? (existing.avatarPath || '') : '' };
      upsertPerson(person);
      setActive(pid);
      modal.remove();
      renderProfileChip(); renderAll(); scheduleSync();
      if (onSaved) onSaved(pid);
    });
    var rm = modal.querySelector('.remove-person');
    if (rm) rm.addEventListener('click', function () { removePerson(pid); modal.remove(); renderProfileChip(); renderAll(); });
    var forced = !loadPeople().length;
    if (!forced) modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  function renderProfileChip() {
    var host = document.getElementById('profile-chip');
    if (!host || MODE !== 'poster') return;
    var p = activePerson();
    if (!p) { host.style.display = 'none'; return; }
    host.style.display = 'inline-flex';
    host.innerHTML = avatarHTML(p.avatarData || (p.avatarPath ? publicUrl(p.avatarPath) : ''), p.name) +
      '<span class="pname">' + esc(p.name) + '</span>';
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
    migratePeople();
    wireDelegation();
    initSupabase();
    if (MODE === 'poster') {
      if (!loadPeople().length) openPerson(null);
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

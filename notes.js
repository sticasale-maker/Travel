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
  var VIDEO_MAX_BYTES = (CFG.VIDEO_MAX_MB || 50) * 1024 * 1024; // cap so uploads don't fail on the road

  var state = { sb: null, uid: null, remote: [], profiles: {}, profilesByName: {}, reactions: {}, replies: {}, replyLikes: {}, syncing: false, attempts: {}, booted: false };
  var REACTIONS = ['❤️', '😂', '🔥', '👏'];
  function clientId() { var c = localStorage.getItem('travel_client'); if (!c) { c = uuid(); localStorage.setItem('travel_client', c); } return c; }

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
  function activePerson() { if (activeId() === '__anon__') return null; return personById(activeId()) || loadPeople()[0] || null; }
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
  // Match an entry to a person known on this device (by key, else by name), so
  // that person's *current* photo shows on all their entries — even older ones.
  function localPersonFor(n) {
    var people = loadPeople();
    if (n.person_key) { var byKey = people.filter(function (p) { return p.id === n.person_key; })[0]; if (byKey) return byKey; }
    if (n.author) { var an = String(n.author).toLowerCase(); var byName = people.filter(function (p) { return (p.name || '').toLowerCase() === an; })[0]; if (byName) return byName; }
    return null;
  }
  function noteAvatarURL(n) {
    var lp = localPersonFor(n);
    if (lp) { if (lp.avatarData) return lp.avatarData; if (lp.avatarPath) return publicUrl(lp.avatarPath); }
    if (n.avatar_path) return publicUrl(n.avatar_path);
    if (n._local && n.avatar_data) return n.avatar_data;
    // match by author name across all profiles — resilient to session/uid changes
    var byName = n.author && state.profilesByName[n.author];
    if (byName && byName.avatar_path) return publicUrl(byName.avatar_path);
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
      var req = indexedDB.open('travel-notes-db', 3);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos'))
          db.createObjectStore('photos', { keyPath: 'id' }).createIndex('note_id', 'note_id', { unique: false });
        // Voice memos, keyed by note id. We store the raw ArrayBuffer + mime type,
        // NOT a Blob: iOS can invalidate a file-backed Blob across a reload, but a
        // plain buffer always round-trips intact. Rebuilt into a Blob on read.
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
        // cache of everyone's entries (fetched from the server) for offline reading
        if (!db.objectStoreNames.contains('remote')) db.createObjectStore('remote', { keyPath: 'id' });
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
  // Voice memos: stored as {id, buf, type}; see the store comment in openDB().
  function putAudioBuf(id, buf, type) { return tx('audio', 'readwrite').then(function (s) { return idbReq(s.put({ id: id, buf: buf, type: type || 'audio/mp4' })); }); }
  function delAudioBuf(id) { return tx('audio', 'readwrite').then(function (s) { return idbReq(s.delete(id)); }); }
  function allAudioBufs() { return tx('audio', 'readonly').then(function (s) { return idbReq(s.getAll()); }); }
  // remote-entry cache (so everyone's entries read offline)
  function cacheRemote(rows) {
    return openDB().then(function (db) {
      return new Promise(function (res) {
        var st = db.transaction('remote', 'readwrite').objectStore('remote');
        st.clear();
        rows.forEach(function (r) { st.put(r); });
        st.transaction.oncomplete = function () { res(); };
        st.transaction.onerror = function () { res(); };
      });
    }).catch(function () {});
  }
  function loadRemoteCache() { return tx('remote', 'readonly').then(function (s) { return idbReq(s.getAll()); }).catch(function () { return []; }); }

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
      .then(function (res) { if (!res.error && res.data) { state.remote = res.data; renderAll(); cacheRemote(res.data); backfillTranslations(res.data); } })
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
  function fetchReactions() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('reactions').select('note_id,emoji,client_id').then(function (res) {
      if (!res.error && res.data) {
        var m = {}; res.data.forEach(function (r) { (m[r.note_id] = m[r.note_id] || []).push(r); });
        state.reactions = m; renderAll();
      }
    }).catch(function () {});
  }
  function fetchReplies() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('note_replies').select('id,note_id,author,body,created_at,client_id').then(function (res) {
      if (!res.error && res.data) {
        var m = {}; res.data.forEach(function (r) { (m[r.note_id] = m[r.note_id] || []).push(r); });
        state.replies = m; renderAll();
      }
    }).catch(function () {});
  }
  function fetchReplyLikes() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('reply_likes').select('reply_id,client_id').then(function (res) {
      if (!res.error && res.data) {
        var m = {}; res.data.forEach(function (r) { (m[r.reply_id] = m[r.reply_id] || []).push(r); });
        state.replyLikes = m; renderAll();
      }
    }).catch(function () {});
  }
  function fetchSocial() { return Promise.all([fetchReactions(), fetchReplies(), fetchReplyLikes()]); }

  function fetchProfiles() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('profiles').select('*')
      .then(function (res) {
        if (!res.error && res.data) {
          var m = {}, byName = {};
          res.data.forEach(function (p) { m[p.user_id] = p; if (p.name && p.avatar_path) byName[p.name] = p; });
          state.profiles = m; state.profilesByName = byName; renderAll();
        }
      }).catch(function () {});
  }

  // Publish the active person's profile (uid -> name + avatar) so any viewer can
  // resolve their photo by name, even for entries saved under a different uid.
  function syncProfiles() {
    if (!state.sb || !state.uid) return Promise.resolve();
    var ap = activePerson();
    if (!ap || !ap.avatarPath) return Promise.resolve();
    return state.sb.from('profiles')
      .upsert({ user_id: state.uid, name: ap.name, avatar_path: ap.avatarPath, updated_at: nowISO() })
      .then(function () {}).catch(function () {});
  }

  // Shared people roster: push this phone's people so other phones can see them.
  function syncPeople() {
    if (!state.sb || !state.uid) return Promise.resolve();
    var people = loadPeople(); if (!people.length) return Promise.resolve();
    var rows = people.map(function (p) { return { id: p.id, name: p.name, avatar_path: p.avatarPath || '', updated_at: nowISO() }; });
    return state.sb.from('people').upsert(rows).then(function () {}).catch(function () {});
  }
  // Pull the shared roster and merge into this phone's list (so a fresh phone
  // shows everyone). Keeps a local photo if one was set on this device.
  function fetchPeople() {
    if (!state.sb) return Promise.resolve();
    return state.sb.from('people').select('*').then(function (res) {
      if (res.error || !res.data) return;
      var local = loadPeople(), byId = {}, changed = false;
      local.forEach(function (p) { byId[p.id] = p; });
      res.data.forEach(function (sp) {
        var lp = byId[sp.id];
        if (lp) {
          if (lp.name !== sp.name) { lp.name = sp.name; changed = true; }
          if (!lp.avatarData && (lp.avatarPath || '') !== (sp.avatar_path || '')) { lp.avatarPath = sp.avatar_path || ''; changed = true; }
        } else {
          local.push({ id: sp.id, name: sp.name, avatarData: '', avatarPath: sp.avatar_path || '' }); changed = true;
        }
      });
      if (changed) { savePeople(local); renderProfileChip(); }
    }).catch(function () {});
  }
  // On a phone that has the roster but no one picked yet, ask who they are.
  function maybePromptIdentity() {
    if (MODE !== 'poster') return;
    if (!activeId() && loadPeople().length) openSwitcher();
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
          .then(function (res) {
            if (res.error) return;
            p.avatarPath = path; dirty = true;
            // stamp this photo onto the person's existing entries so every viewer sees it
            return state.sb.from('travel_notes').update({ avatar_path: path })
              .eq('user_id', state.uid).eq('author', p.name).then(function () {}).catch(function () {});
          })
          .catch(function () {});
      });
    });
    return chain.then(function () { if (dirty) savePeople(people); });
  }

  // Stamp each person's current photo onto their entries. Runs once per
  // (person, photo) per session; retries next session if it fails (e.g. the
  // avatar_path column doesn't exist yet), so photos backfill after the ALTER.
  var _propagated = {};
  function propagateAvatars() {
    if (!state.sb || !state.uid) return Promise.resolve();
    var people = loadPeople(), chain = Promise.resolve();
    people.forEach(function (p) {
      if (!p.avatarPath) return;
      var key = p.id + ':' + p.avatarPath;
      if (_propagated[key]) return;
      chain = chain.then(function () {
        return state.sb.from('travel_notes').update({ avatar_path: p.avatarPath })
          .eq('user_id', state.uid).eq('author', p.name)
          .then(function (res) { if (!res.error) _propagated[key] = 1; })
          .catch(function () {});
      });
    });
    return chain;
  }

  // ---------------------------------------------------------------- sync
  // Attempt counts persist to localStorage: an installed iOS app is killed and
  // relaunched constantly, and an in-memory counter resets to 0 every time — so
  // "give up after N tries" would never actually fire on a phone.
  function loadAttempts() { try { return JSON.parse(localStorage.getItem('travel_attempts') || '{}') || {}; } catch (e) { return {}; } }
  function saveAttempts() { try { localStorage.setItem('travel_attempts', JSON.stringify(state.attempts)); } catch (e) {} }
  function backoffReady(id) { var a = state.attempts[id]; return !a || Date.now() >= a.nextTry; }
  function noteFailed(id, err) { var a = state.attempts[id] || { count: 0 }; a.count += 1; a.nextTry = Date.now() + Math.min(5 * 60000, 5000 * Math.pow(2, a.count - 1));
    if (err) { try { a.err = err.message || err.error_description || err.error || (typeof err === 'string' ? err : JSON.stringify(err)); } catch (e) { a.err = 'upload failed'; } }
    state.attempts[id] = a; saveAttempts(); }
  function noteOK(id) { delete state.attempts[id]; saveAttempts(); }

  // upsert a row; if the DB doesn't have avatar_path yet, retry without it so
  // posting never breaks before the one-line ALTER is run.
  // upsert; if the DB is missing a column (e.g. avatar_path/audio_path not yet
  // migrated), strip the named column and retry so posting never breaks.
  function upsertRow(row) {
    return state.sb.from('travel_notes').upsert(row).then(function (res) {
      if (res.error) {
        var msg = res.error.message || '';
        var m = msg.match(/'([a-z_]+)' column/) || msg.match(/column [\w".]*?([a-z_]+) does not exist/);
        var col = m && m[1];
        if (col && row[col] !== undefined) { var r2 = Object.assign({}, row); delete r2[col]; return upsertRow(r2); }
      }
      return res;
    });
  }

  // Reject a promise if it hasn't settled in `ms` — stops a stalled network
  // request from freezing the whole sync queue (and the "Saving…" state) forever.
  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error((label || 'operation') + ' timed out')); }, ms);
      Promise.resolve(promise).then(function (v) { clearTimeout(to); resolve(v); }, function (e) { clearTimeout(to); reject(e); });
    });
  }
  // Upload to Supabase Storage via XHR so we get real byte-progress (the JS client
  // doesn't expose upload progress). Returns {data} or {error} like the client.
  function uploadWithProgress(path, blob, contentType, onProgress) {
    return state.sb.auth.getSession().then(function (r) {
      var token = r.data && r.data.session && r.data.session.access_token;
      return new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();
        var url = CFG.SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/');
        xhr.open('POST', url, true);
        xhr.setRequestHeader('authorization', 'Bearer ' + token);
        xhr.setRequestHeader('apikey', CFG.SUPABASE_ANON_KEY);
        xhr.setRequestHeader('x-upsert', 'true');
        if (contentType) xhr.setRequestHeader('content-type', contentType);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve({ data: { path: path } });
          else { var msg = 'upload failed (' + xhr.status + ')'; try { var j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch (e) {} resolve({ error: { message: msg, statusCode: xhr.status } }); }
        };
        xhr.onerror = function () { resolve({ error: { message: 'network error' } }); };
        xhr.ontimeout = function () { resolve({ error: { message: 'upload timed out' } }); };
        xhr.timeout = 120000;
        xhr.send(blob);
      });
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
            .then(function () { delete audioBlobCache[n.id]; return delAudioBuf(n.id).catch(function () {}); })
            .then(function () { return delNote(n.id); });
        });
    }
    return photosFor(n.id).then(function (photos) {
      var pending = photos.filter(function (p) { return !p.uploaded; });
      var paths = (n.photo_paths || []).slice();
      var mediaErr = null;   // first media that couldn't upload this pass
      var chain = Promise.resolve();
      var dropped = false;
      pending.forEach(function (p) {
        chain = chain.then(function () {
          // A dead/empty blob (e.g. an old clip whose bytes iOS already dropped)
          // can never upload — abandon it so the post can still post, rather than
          // retrying "Saving…" forever.
          if (!p.blob || !p.blob.size) { p.uploaded = true; p.failed = true; dropped = true; return putPhoto(p); }
          var path = state.uid + '/' + n.id + '/' + p.filename;
          var isVid = isVideoName(p.filename);
          var ctype = isVid ? ((p.blob && p.blob.type) || 'video/mp4') : 'image/jpeg';
          setProgress(n, isVid ? 'kind_video' : 'kind_photo', 0);
          return uploadWithProgress(path, p.blob, ctype, function (f) { setProgress(n, isVid ? 'kind_video' : 'kind_photo', f); })
            .then(function (res) { if (res.error) throw res.error; if (paths.indexOf(path) === -1) paths.push(path); p.uploaded = true; p.path = path; return putPhoto(p); })
            // A single slow/failing clip must NOT block the whole post. If the
            // server says the content is empty, it's unrecoverable → drop it;
            // otherwise record it and retry next sync while the post still goes out.
            .catch(function (err) {
              var msg = ((err && (err.message || err.error)) || '') + '';
              if (/no content|content provided|empty/i.test(msg)) { p.uploaded = true; p.failed = true; dropped = true; return putPhoto(p); }
              if (!mediaErr) mediaErr = err;
            });
        });
      });
      return chain.then(function () {
        n.photo_paths = paths;
        // upload a voice memory if one is attached and not yet uploaded (best-effort)
        var audioBlob = audioBlobCache[n.id];
        var audioPending = !!(audioBlob && !n.audio_path);
        var audioP = Promise.resolve();
        if (audioPending) {
          // Dead/empty audio blob → abandon it so the post can still post.
          if (!audioBlob || !audioBlob.size) { audioPending = false; }
          // Failed too many times: stop blocking the post so the text + photos go
          // out now. The recording is NOT discarded — the bytes stay in IndexedDB
          // and the note keeps an audio_stuck marker so it can be retried later.
          else if (state.attempts[n.id] && state.attempts[n.id].count > 3) { audioPending = false; n.audio_stuck = true; }
          else {
            var ty = audioBlob.type || '';
            var ext = ty.indexOf('webm') > -1 ? 'webm' : (ty.indexOf('ogg') > -1 ? 'ogg' : 'm4a');
            var apath = state.uid + '/' + n.id + '/audio.' + ext;
            setProgress(n, 'kind_voice', 0);
            audioP = withTimeout(uploadWithProgress(apath, audioBlob, ty || 'audio/mp4', function (f) { setProgress(n, 'kind_voice', f); }), 90000, 'audio upload')
              .then(function (res) {
                if (!res.error) { n.audio_path = apath; audioPending = false; n.audio_stuck = false; delete audioBlobCache[n.id]; return delAudioBuf(n.id).catch(function () {}); }
                // Surface the real storage error on the note's ⚠ badge instead of
                // the generic "media still uploading", so a failure is diagnosable.
                if (!mediaErr) mediaErr = res.error;
              })
              .catch(function (err) {
                var msg = ((err && (err.message || err.error)) || '') + '';
                if (/no content|content provided|empty/i.test(msg)) { audioPending = false; delete audioBlobCache[n.id]; return delAudioBuf(n.id).catch(function () {}); }
                if (!mediaErr) mediaErr = err;
                // else: retry on next sync; don't throw so the post still goes out
              });
          }
        }
        return audioP.then(function () {
        // fill the author's avatar path (uploaded above) if we didn't have it yet
        if (!n.avatar_path && n.person_key) { var pr = personById(n.person_key); if (pr && pr.avatarPath) n.avatar_path = pr.avatarPath; }
        var row = {
          id: n.id, day_key: n.day_key, author: n.author || 'Traveller',
          user_id: state.uid, lang: n.lang || lang(),
          body: n.body || '', body_en: n.body_en || '', body_it: n.body_it || '',
          photo_paths: paths, captured_at: n.captured_at, updated_at: nowISO(),
          avatar_path: n.avatar_path || '', audio_path: n.audio_path || ''
        };
        // Insert the row now — the post goes live and the new-post notification
        // fires — even if a clip is still uploading. Remaining media is added on
        // later syncs (re-upsert; the insert-only notification won't re-fire).
        return upsertRow(row).then(function (res) {
          if (res.error) throw res.error;   // the row itself failed → real failure, retry all
          n.user_id = state.uid;
          var allDone = !mediaErr && !audioPending;
          if (allDone) { n.synced = true; n.pending_op = null; }
          var translate = (row.body && !n._translated)
            ? state.sb.functions.invoke('translate-note', { body: { id: n.id } }).then(function () { n._translated = true; }).catch(function () {})
            : Promise.resolve();
          return translate.then(function () {
            return putNote(n).then(function () {
              // Media still outstanding: surface it (⚠ badge) and let backoff retry.
              if (!allDone) throw mediaErr || new Error('media still uploading');
            });
          });
        });
        });
      });
    });
  }

  function syncNow() {
    if (MODE !== 'poster' || !state.sb || state.syncing || !navigator.onLine) return Promise.resolve();
    state.syncing = true;
    var work = ensureAuth().then(function () {
      if (!state.uid) return;
      return uploadAvatars().then(propagateAvatars).then(syncProfiles).then(syncPeople).then(function () {
        return allNotes().then(function (notes) {
          var pending = notes.filter(function (n) { return !n.synced && n.pending_op; })
            .filter(function (n) { return backoffReady(n.id); })
            .sort(function (a, b) { return (a.captured_at || '').localeCompare(b.captured_at || ''); });
          var chain = Promise.resolve();
          pending.forEach(function (n) {
            // Per-note timeout: one stalled post can't hold up the rest of the queue.
            chain = chain.then(function () { return withTimeout(syncNote(n), 180000, 'sync').then(function () { noteOK(n.id); }).catch(function (err) { noteFailed(n.id, err); }); });
          });
          return chain;
        });
      });
    }).then(function () { return Promise.all([fetchRemote(), fetchProfiles(), fetchSocial(), fetchPeople()]); });
    // Overall guard: whatever happens, the "syncing" flag is released so the
    // queue never gets permanently wedged by a hung request.
    return withTimeout(work, 300000, 'sync').catch(function () {}).then(function () { state.syncing = false; clearProgress(); renderAll(); });
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

  // A media item is a video if its stored name/path ends in a video extension;
  // everything else is a (jpeg) photo. Videos render as an inline <video> with
  // native controls (no lightbox); photos keep the tap-to-zoom <img>.
  var VIDEO_RE = /\.(mp4|m4v|mov|webm|ogv)$/i;
  function isVideoName(s) { return VIDEO_RE.test(s || ''); }
  function mediaTag(url, video, lazy) {
    if (video) return '<video src="' + esc(url) + '" controls playsinline preload="metadata"></video>';
    return '<img ' + (lazy ? 'loading="lazy" ' : '') + 'src="' + esc(url) + '" data-full="' + esc(url) + '" alt="">';
  }
  function photoHTML(n) {
    var out = '';
    (n.photo_paths || []).forEach(function (p) { var url = publicUrl(p); if (url) out += mediaTag(url, isVideoName(p), true); });
    return out;
  }
  function localPhotoHTML(photos) {
    var out = ''; (photos || []).forEach(function (p) { var url = URL.createObjectURL(p.blob); out += mediaTag(url, isVideoName(p.filename || (p.blob && p.blob.type) || ''), false); }); return out;
  }

  // Voice memos are played through the Web Audio API rather than a native
  // <audio controls>. MediaRecorder clips (iOS mp4, and webm) ship with no
  // duration in the container header, so an <audio> element can't tell how long
  // the file is and stops partway through even for a complete local file (this
  // was the ~13s cut-off on iPhone). decodeAudioData reads the whole file into a
  // buffer whose real length IS known, and an AudioBufferSourceNode plays that
  // buffer end to end. We render our own play/pause + progress UI on top.
  var VCTX = null, vActive = null;   // vActive = stop() of whichever memo is currently sounding
  var vPlayingEl = null, vDeferred = []; // the playing .vmemo, and days whose re-render we deferred
  // Live Blobs for playback + upload. Backed by the 'audio' store (raw
  // ArrayBuffers), which is rehydrated into here on boot — so a recording is not
  // lost when the app is closed before its upload finishes. Never store a Blob
  // itself in IndexedDB: iOS can invalidate a file-backed Blob across a reload.
  var audioBlobCache = {};
  function hydrateAudioCache() {
    return allAudioBufs().then(function (recs) {
      (recs || []).forEach(function (r) {
        if (!r || !r.buf || audioBlobCache[r.id]) return;
        try { audioBlobCache[r.id] = new Blob([r.buf], { type: r.type || 'audio/mp4' }); } catch (e) {}
      });
    }).catch(function () {});
  }
  function vctx() { VCTX = VCTX || new (window.AudioContext || window.webkitAudioContext)(); return VCTX; }
  function vfmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function vStopActive() { if (vActive) { var f = vActive; vActive = null; try { f(); } catch (e) {} } }
  // Background sync rebuilds each day's note list; doing that mid-playback would
  // detach the player button while the audio (a JS closure) plays on, orphaned
  // and unstoppable. So renderDay defers any day that holds the playing memo, and
  // we flush those deferred renders once nothing is playing anymore.
  function vFlushDeferred() {
    if (vPlayingEl) return;
    var d = vDeferred; vDeferred = [];
    d.forEach(function (dayEl) { renderDay(dayEl); });
  }

  function initVoicePlayer(el) {
    if (!el || el.dataset.vinit) return; el.dataset.vinit = '1';
    var src = el.dataset.vsrc;
    var btn = el.querySelector('.vm-btn'), fill = el.querySelector('.vm-fill'),
        timeEl = el.querySelector('.vm-time'), track = el.querySelector('.vm-track');
    var buffer = null, node = null, playing = false, startedAt = 0, offset = 0, raf = 0, dur = 0, loading = false;

    function elapsed() { return playing ? (vctx().currentTime - startedAt) : offset; }
    function render(cur) {
      if (dur && cur > dur) cur = dur; if (cur < 0) cur = 0;
      fill.style.width = dur ? (cur / dur * 100) + '%' : '0%';
      timeEl.textContent = vfmt(cur) + (dur ? ' / ' + vfmt(dur) : '');
    }
    // Always actually silence + release the node. iOS keeps playing audio if you
    // only drop the reference, which is what left memos unstoppable before.
    function killNode() {
      if (node) { try { node.onended = null; } catch (e) {} try { node.stop(); } catch (e) {}
        try { node.disconnect(); } catch (e) {} node = null; }
    }
    function tick() {
      if (!playing) return;
      var cur = elapsed();
      if (dur && cur >= dur) { finishEnd(); return; }   // real end, tracked by wall clock
      render(cur); raf = requestAnimationFrame(tick);
    }
    // When playback ends, release the "currently playing" slot and let any
    // renders we deferred during playback run (async, so a memo that starts in
    // the same tick — e.g. tapping another one — re-claims the slot first).
    function releaseSlot() { if (vPlayingEl === el) { vPlayingEl = null; setTimeout(vFlushDeferred, 0); } }
    function finishEnd() { killNode(); playing = false; offset = 0; if (vActive === stopHere) vActive = null;
      cancelAnimationFrame(raf); btn.textContent = '▶'; render(0); releaseSlot(); }
    function stopHere() {   // pause where we are (button while playing, or pre-empted by another memo)
      if (node) offset = elapsed(); if (dur && offset > dur) offset = dur; if (offset < 0) offset = 0;
      killNode(); playing = false; if (vActive === stopHere) vActive = null;
      cancelAnimationFrame(raf); btn.textContent = '▶'; render(offset); releaseSlot();
    }
    function ensureBuffer() {
      if (buffer) return Promise.resolve(buffer);
      if (loading) return Promise.reject();
      loading = true; btn.textContent = '…';
      return fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
        return new Promise(function (res, rej) {
          vctx().decodeAudioData(ab, function (buf) { buffer = buf; dur = buf.duration; loading = false; res(buf); },
            function (e) { loading = false; rej(e); });
        });
      });
    }
    function start() {
      var c = vctx(); if (c.state === 'suspended') c.resume();
      ensureBuffer().then(function (buf) {
        if (vActive && vActive !== stopHere) vStopActive();  // never let two memos overlap
        killNode();
        if (offset >= dur) offset = 0;
        node = c.createBufferSource(); node.buffer = buf; node.connect(c.destination);
        var thisNode = node;
        // iOS sometimes fires onended long before the real end; only trust it if
        // the wall clock says we're actually there, otherwise let tick() finish.
        node.onended = function () {
          if (node !== thisNode) return;
          if (!dur || (vctx().currentTime - startedAt) >= dur - 0.6) finishEnd();
        };
        startedAt = c.currentTime - offset; node.start(0, offset);
        playing = true; vActive = stopHere; vPlayingEl = el; btn.textContent = '⏸';
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      }).catch(function () { if (!buffer) btn.textContent = '⚠'; });
    }
    btn.addEventListener('click', function () { if (loading) return; if (playing) stopHere(); else start(); });
    track.addEventListener('click', function (e) {
      if (!dur) return;
      var rect = track.getBoundingClientRect();
      offset = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * dur;
      if (playing) start(); else render(offset);
    });
    render(0);
  }
  function initVoicePlayers(root) {
    (root || document).querySelectorAll('.vmemo[data-vsrc]').forEach(initVoicePlayer);
  }

  // Diagnostic readout under a freshly recorded memo: recorded time (wall clock)
  // vs. the file's true decoded length. Kept as a reassurance that the full
  // recording is captured.
  var _diagCtx = null;
  function showAudioDiag(el, blob, recSecs) {
    if (!el) return;
    var kb = Math.round(blob.size / 1024);
    el.textContent = 'recorded ' + recSecs + 's · ' + kb + ' KB · reading…';
    try {
      _diagCtx = _diagCtx || new (window.AudioContext || window.webkitAudioContext)();
      blob.arrayBuffer().then(function (buf) {
        _diagCtx.decodeAudioData(buf, function (ab) {
          el.textContent = 'recorded ' + recSecs + 's · audio ' + ab.duration.toFixed(1) + 's · ' + kb + ' KB';
        }, function () { el.textContent = 'recorded ' + recSecs + 's · ' + kb + ' KB · (couldn’t decode)'; });
      }).catch(function () { el.textContent = 'recorded ' + recSecs + 's · ' + kb + ' KB'; });
    } catch (e) { el.textContent = 'recorded ' + recSecs + 's · ' + kb + ' KB'; }
  }

  function voicePlayerHTML(src) {
    return '<div class="vmemo" data-vsrc="' + esc(src) + '">' +
      '<button type="button" class="vm-btn" aria-label="Play">▶</button>' +
      '<div class="vm-track"><div class="vm-fill"></div></div>' +
      '<span class="vm-time">0:00</span></div>';
  }
  function audioHTML(n) {
    if (n.audio_path) return voicePlayerHTML(publicUrl(n.audio_path));
    if (n._local) { var blob = audioBlobCache[n.id]; if (blob) { try { return voicePlayerHTML(URL.createObjectURL(blob)); } catch (e) {} } }
    return '';
  }
  function reactionsHTML(noteId) {
    var list = state.reactions[noteId] || [], mine = clientId();
    return '<div class="reacts" data-rnote="' + esc(noteId) + '">' + REACTIONS.map(function (em) {
      var count = 0, on = false;
      list.forEach(function (r) { if (r.emoji === em) { count++; if (r.client_id === mine) on = true; } });
      return '<button type="button" class="react' + (on ? ' on' : '') + '" data-emoji="' + em + '">' +
        em + (count ? '<span class="rc">' + count + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function replyLikeHTML(replyId) {
    var likes = state.replyLikes[replyId] || [], mine = clientId(), on = false;
    likes.forEach(function (r) { if (r.client_id === mine) on = true; });
    return '<button type="button" class="reply-like' + (on ? ' on' : '') + '" data-rlike="' + esc(replyId) + '" aria-label="Like">' +
      '❤<span class="rc">' + (likes.length || '') + '</span></button>';
  }
  function repliesHTML(noteId) {
    var mineC = clientId();
    var list = (state.replies[noteId] || []).slice().sort(function (a, b) { return (a.created_at || '').localeCompare(b.created_at || ''); });
    var items = list.map(function (r) {
      var acts = '<span class="reply-acts">' + (r.id ? replyLikeHTML(r.id) : '') +
        (r.id && r.client_id === mineC ? '<button type="button" class="reply-del" data-rpdel="' + esc(r.id) + '">' + esc(t('del')) + '</button>' : '') + '</span>';
      return '<div class="reply"><span class="reply-main"><span class="reply-author">' + esc(r.author || '') + '</span> ' + esc(r.body) + '</span>' + acts + '</div>';
    }).join('');
    return '<div class="replies" data-rpnote="' + esc(noteId) + '">' + items +
      '<div class="reply-add"><input type="text" class="reply-in" placeholder="' + esc(t('reply_ph')) + '" maxlength="240">' +
      '<button type="button" class="reply-send">' + esc(t('reply_send')) + '</button></div></div>';
  }

  function renderDay(dayEl) {
    var dayKey = dayEl.dataset.date;
    var listEl = dayEl.querySelector('.note-list');
    if (!listEl) return;
    allNotes().then(function (locals) {
      var list = mergedForDay(dayKey, locals);
      // Don't rebuild this list out from under a memo that's playing in it —
      // that would orphan the audio. Defer until playback ends (vFlushDeferred).
      if (vPlayingEl && listEl.contains(vPlayingEl)) {
        if (vDeferred.indexOf(dayEl) < 0) vDeferred.push(dayEl);
        return;
      }
      var bottomBtn = dayEl.querySelector('.add-note-bottom');
      if (bottomBtn) bottomBtn.style.display = list.length ? 'flex' : 'none';
      if (!list.length) {
        listEl.innerHTML = '<div class="note-empty">' + t(MODE === 'poster' ? 'empty_poster' : 'empty_reader') + '</div>';
        return;
      }
      var html = list.map(function (n) {
        var mine = myNote(n), body = pickBody(n), name = displayName(n), av = noteAvatarURL(n);
        var badges = '';
        if (n._pending) {
          badges += '<span class="note-badge pending">' + esc(t('badge_pending')) + '</span>';
          var at = state.attempts[n.id];
          if (at && at.err) badges += '<span class="note-badge err" title="' + esc(at.err) + '">⚠ ' + esc(String(at.err).slice(0, 80)) + '</span>';
        }
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
          audioHTML(n) + actions +
          reactionsHTML(n.id) + repliesHTML(n.id) + '</div>';
      }).join('');
      listEl.innerHTML = html;
      initVoicePlayers(listEl);

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

  function renderAll() { document.querySelectorAll('.day').forEach(renderDay); updateSyncStatus(); renderProfileChip(); updateBadge(); }

  // ---------------------------------------------------------------- capture UI
  function buildDayUI(dayEl) {
    if (dayEl.querySelector('.notes')) return;
    var dayKey = dayEl.dataset.date;
    var wrap = document.createElement('div');
    wrap.className = 'notes';
    wrap.innerHTML = MODE === 'poster'
      ? '<div class="notes-head"><h4>' + esc(t('journal_title')) + '</h4>' +
        '<button class="add-note-btn" type="button">' + esc(t('add_memory')) + '</button></div>' +
        '<div class="note-list"></div>' +
        '<button class="add-note-btn add-note-bottom" type="button" style="display:none">' + esc(t('add_memory')) + '</button>'
      : '<div class="notes-head"><h4>' + esc(t('journal_title')) + '</h4></div><div class="note-list"></div>';
    dayEl.appendChild(wrap);
    if (MODE === 'poster') {
      var openNew = function () {
        // set up who you are the first time you actually post (not on page load)
        if (!loadPeople().length) openPerson(null, function () { openForm(dayEl, dayKey, null); });
        else openForm(dayEl, dayKey, null);
      };
      wrap.querySelectorAll('.add-note-btn').forEach(function (b) { b.addEventListener('click', openNew); });
    }
  }

  function openForm(dayEl, dayKey, editNote) {
    var notes = dayEl.querySelector('.notes');
    if (notes.querySelector('.note-form')) return;
    var pending = [], pendingAudio = null;
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
      '<div class="file-row"><input type="file" accept="image/*,video/*" multiple></div>' +
      '<div class="thumbs"></div>' +
      '<div class="voice-row"></div>' +
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
      files.forEach(function (f) {
        if ((f.type || '').indexOf('video/') === 0) {
          if (f.size > VIDEO_MAX_BYTES) { alert(t('video_too_big')); return; }
          var vext = (f.name.match(/\.(mp4|m4v|mov|webm|ogv)$/i) || [, 'mp4'])[1].toLowerCase();
          var vname = uuid() + '.' + vext;
          var vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.preload = 'metadata';
          thumbs.appendChild(vid);
          // Read the picked file into an in-memory blob NOW. A raw File from the
          // picker is just a reference to the file on disk, and iOS drops that
          // reference across a reload — the stored video then uploads as 0 bytes
          // ("no content provided"). Materialising the bytes makes it survive.
          f.arrayBuffer().then(function (buf) {
            var vblob = new Blob([buf], { type: f.type || 'video/mp4' });
            var vurl = URL.createObjectURL(vblob);
            vid.src = vurl;
            pending.push({ blob: vblob, filename: vname, url: vurl });
          }).catch(function () { vid.remove(); alert(t('video_read_failed')); });
        } else {
          shrink(f).then(function (blob) {
            var filename = uuid() + '.jpg', url = URL.createObjectURL(blob);
            pending.push({ blob: blob, filename: filename, url: url });
            var img = document.createElement('img'); img.src = url; thumbs.appendChild(img);
          });
        }
      });
    });
    // voice recording (feature-detected; hidden where unsupported)
    var rec = null;
    var voiceRow = form.querySelector('.voice-row');
    if (window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      voiceRow.innerHTML = '<button type="button" class="rec-btn">🎙 ' + esc(t('record')) + '</button><span class="rec-status"></span>';
      var recBtn = voiceRow.querySelector('.rec-btn'), recStatus = voiceRow.querySelector('.rec-status'), chunks = [], recStart = 0;
      recBtn.addEventListener('click', function () {
        if (rec && rec.state === 'recording') { rec.stop(); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          chunks = []; rec = new MediaRecorder(stream);
          rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function () {
            stream.getTracks().forEach(function (tk) { tk.stop(); });
            pendingAudio = new Blob(chunks, { type: (rec.mimeType || 'audio/mp4') });
            recBtn.textContent = '🎙 ' + t('rerecord');
            var recSecs = recStart ? Math.round((Date.now() - recStart) / 1000) : 0;
            try {
              recStatus.innerHTML = voicePlayerHTML(URL.createObjectURL(pendingAudio)) +
                '<div class="rec-dbg"></div>';
              initVoicePlayers(recStatus);
              showAudioDiag(recStatus.querySelector('.rec-dbg'), pendingAudio, recSecs);
            } catch (e) {}
          };
          // iOS can hand back a truncated single blob when start() runs with no
          // timeslice; flushing every second forces it to deliver the full recording.
          rec.start(1000); recStart = Date.now();
          recBtn.textContent = '⏹ ' + t('stop'); recStatus.textContent = t('recording');
        }).catch(function () { recStatus.textContent = t('mic_denied'); });
      });
    }

    form.querySelector('.cancel').addEventListener('click', function () { if (rec && rec.state === 'recording') rec.stop(); form.remove(); });
    form.querySelector('.save').addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body && !pending.length && !pendingAudio && !(editNote && (editNote.photo_paths || []).length)) { ta.focus(); return; }
      var person = editNote ? null : (personById(selectedId) || activePerson());
      if (!editNote && person) setActive(person.id); // remember last writer
      saveNote(dayKey, editNote, body, pending, person, pendingAudio).then(function () { form.remove(); renderDay(dayEl); scheduleSync(); });
    });
    ta.focus();
  }

  function saveNote(dayKey, editNote, body, pendingPhotos, person, pendingAudio) {
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
    if (pendingAudio) { audioBlobCache[id] = pendingAudio; base.audio_path = ''; }
    base.updated_at = nowISO();
    base.synced = false;
    base.pending_op = editNote ? 'update' : 'create';
    base._local = true;
    return putNote(base).then(function () {
      var chain = Promise.resolve();
      // Keep the recording's bytes on disk so it survives the app being closed or
      // killed before the upload finishes (memory alone loses it).
      if (pendingAudio) {
        chain = chain.then(function () {
          return pendingAudio.arrayBuffer()
            .then(function (buf) { return putAudioBuf(id, buf, pendingAudio.type); })
            .catch(function () {});
        });
      }
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
      var react = e.target.closest('.react');
      if (react) { toggleReaction(react.closest('[data-rnote]').dataset.rnote, react.dataset.emoji, react.closest('.day')); return; }
      var rlike = e.target.closest('.reply-like');
      if (rlike) { toggleReplyLike(rlike.dataset.rlike, rlike.closest('.day')); return; }
      var rpdel = e.target.closest('.reply-del');
      if (rpdel) { if (!confirm(t('confirm_delete'))) return; deleteReply(rpdel.dataset.rpdel, rpdel.closest('.day')); return; }
      var rsend = e.target.closest('.reply-send');
      if (rsend) {
        var inp = rsend.closest('.reply-add').querySelector('.reply-in'); var b = (inp.value || '').trim();
        if (!b) { inp.focus(); return; }
        submitReply(rsend.closest('[data-rpnote]').dataset.rpnote, b, rsend.closest('.day'));
      }
    });
  }

  function toggleReaction(noteId, emoji, dayEl) {
    if (!state.sb) return;
    var mine = clientId(), list = state.reactions[noteId] || (state.reactions[noteId] = []), idx = -1;
    list.forEach(function (r, i) { if (r.emoji === emoji && r.client_id === mine) idx = i; });
    if (idx >= 0) {
      list.splice(idx, 1); renderDay(dayEl);
      state.sb.from('reactions').delete().eq('note_id', noteId).eq('emoji', emoji).eq('client_id', mine).then(fetchReactions).catch(function () {});
    } else {
      list.push({ emoji: emoji, client_id: mine }); renderDay(dayEl);
      state.sb.from('reactions').insert({ note_id: noteId, emoji: emoji, client_id: mine }).then(fetchReactions).catch(function () {});
    }
  }
  function replyAuthor() {
    if (MODE === 'poster') { var ap = activePerson(); if (ap && ap.name) return ap.name; }
    var rn = localStorage.getItem('travel_reader_name');
    if (!rn) { rn = (window.prompt(t('reader_name_prompt')) || '').trim(); if (rn) localStorage.setItem('travel_reader_name', rn); }
    return rn || 'Guest';
  }
  function submitReply(noteId, body, dayEl) {
    if (!state.sb) return;
    var author = replyAuthor(), id = uuid(), mine = clientId();
    (state.replies[noteId] || (state.replies[noteId] = [])).push({ id: id, author: author, body: body, created_at: nowISO(), client_id: mine });
    renderDay(dayEl);
    state.sb.from('note_replies').insert({ id: id, note_id: noteId, author: author, body: body, client_id: mine }).then(fetchReplies).catch(function () {});
  }
  function toggleReplyLike(replyId, dayEl) {
    if (!state.sb) return;
    var mine = clientId(), list = state.replyLikes[replyId] || (state.replyLikes[replyId] = []), idx = -1;
    list.forEach(function (r, i) { if (r.client_id === mine) idx = i; });
    if (idx >= 0) {
      list.splice(idx, 1); renderDay(dayEl);
      state.sb.from('reply_likes').delete().eq('reply_id', replyId).eq('client_id', mine).then(fetchReplyLikes).catch(function () {});
    } else {
      list.push({ client_id: mine }); renderDay(dayEl);
      state.sb.from('reply_likes').insert({ reply_id: replyId, client_id: mine }).then(fetchReplyLikes).catch(function () {});
    }
  }
  function deleteReply(replyId, dayEl) {
    if (!state.sb) return;
    Object.keys(state.replies).forEach(function (nid) {
      state.replies[nid] = (state.replies[nid] || []).filter(function (r) { return r.id !== replyId; });
    });
    delete state.replyLikes[replyId];
    renderDay(dayEl);
    state.sb.from('note_replies').delete().eq('id', replyId).then(fetchReplies).catch(function () {});
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
      '<button class="add-person-btn follow-anon-btn" type="button">' + esc(t('follow_home')) + '</button></div>';
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
    modal.querySelector('.follow-anon-btn').addEventListener('click', function () { setActive('__anon__'); modal.remove(); renderProfileChip(); });
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
    if (activeId() === '__anon__') {
      host.style.display = 'inline-flex';
      host.innerHTML = '<span class="pname">' + esc(t('following_chip')) + '</span>';
      return;
    }
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
      if (!pend) clearProgress();
    });
  }

  // Live "what's uploading right now, and how far" line in the header.
  function setProgress(n, kindKey, frac) {
    state.progress = { who: (n.author || t('follow_home')), kind: t(kindKey), pct: Math.max(0, Math.min(100, Math.round((frac || 0) * 100))) };
    paintProgress();
  }
  function clearProgress() { state.progress = null; paintProgress(); }
  function paintProgress() {
    var el = document.getElementById('sync-progress');
    if (!el) return;
    var p = state.progress;
    if (!p) { el.hidden = true; return; }
    el.hidden = false;
    var lbl = el.querySelector('.sp-label'), fill = el.querySelector('.sp-fill');
    if (lbl) lbl.textContent = t('sync_item', { who: p.who, kind: p.kind }) + ' · ' + p.pct + '%';
    if (fill) fill.style.width = p.pct + '%';
  }

  // -------------------------------------------------------- unread app badge
  // Badges the installed-app icon with the count of journal entries from other
  // people that arrived since you last had the app open. (Updates while the app
  // is open; live updates when closed would need push notifications.)
  function badgeTime(n) { return n.created_at || n.captured_at || ''; }
  function badgeMine(n) { return n.user_id && state.uid && n.user_id === state.uid; }
  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    var seen = ''; try { seen = localStorage.getItem('travel_last_seen') || ''; } catch (e) {}
    var unread = (state.remote || []).filter(function (n) { return !badgeMine(n) && badgeTime(n) > seen; }).length;
    try { if (unread > 0) navigator.setAppBadge(unread); else navigator.clearAppBadge(); } catch (e) {}
  }
  function markSeen() {
    var max = ''; (state.remote || []).forEach(function (n) { var tt = badgeTime(n); if (tt > max) max = tt; });
    try { localStorage.setItem('travel_last_seen', max || nowISO()); } catch (e) {}
    if ('clearAppBadge' in navigator) { try { navigator.clearAppBadge(); } catch (e) {} }
  }

  // ---------------------------------------------------------------- boot
  function scheduleSync() { updateSyncStatus(); syncNow(); }
  function mount() { document.querySelectorAll('.day').forEach(buildDayUI); renderAll(); }

  function initOnce() {
    if (state.booted) return;
    state.booted = true;
    // Baseline "seen" at first ever launch so existing entries don't all badge.
    try { if (!localStorage.getItem('travel_last_seen')) localStorage.setItem('travel_last_seen', nowISO()); } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (document.hidden) markSeen(); else updateBadge(); });
    migratePeople();
    wireDelegation();
    initSupabase();
    // Show everyone's last-known entries immediately (works with no signal).
    loadRemoteCache().then(function (rows) {
      if (rows && rows.length && !state.remote.length) { state.remote = rows; renderAll(); }
    });
    if (MODE === 'poster') {
      state.attempts = loadAttempts();
      // don't block the view with a setup modal — the journal is readable
      // straight away; we prompt for a profile only when someone taps "Add a memory".
      hydrateAudioCache().then(function () { renderAll(); });
      ensureAuth().then(function () { fetchProfiles(); fetchPeople().then(maybePromptIdentity); renderAll(); syncNow(); });
      window.addEventListener('online', syncNow);
      window.addEventListener('offline', updateSyncStatus);
      setInterval(function () { if (navigator.onLine) syncNow(); }, 20000);
    } else {
      if (navigator.onLine) { fetchRemote(); fetchProfiles(); fetchSocial(); }
      window.addEventListener('online', function () { fetchRemote(); fetchProfiles(); fetchSocial(); });
      setInterval(function () { if (navigator.onLine) { fetchRemote(); fetchProfiles(); fetchSocial(); } }, 60000);
    }
  }

  document.addEventListener('itinerary:ready', function () { mount(); initOnce(); });
  if (document.querySelector('.day')) { mount(); initOnce(); }
})();

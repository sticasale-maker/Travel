/* itinerary.js — shared by index.html (poster) and read.html (reader).
   Loads the itinerary markup partial for the current language, runs the
   today-auto-focus + tap-to-focus behaviour, then fires `itinerary:ready`
   (each render) so map.js and notes.js can (re)build. Reloads on language change. */
(function () {
  var MOUNT = document.getElementById('itinerary-mount');
  var I18N = window.I18N;

  // Temporary on-screen readout to diagnose notification deep-linking on iOS.
  function dbg(m) { try { var e = document.getElementById('dl-dbg'); if (e) e.textContent = 'dl: ' + m; } catch (_) {} }

  function runFocus() {
    var days = Array.prototype.slice.call(document.querySelectorAll('.day'));
    var bText = document.getElementById('banner-text');
    var jump = document.getElementById('jump');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date('2026-07-31T00:00:00');
    var end = new Date('2026-08-13T00:00:00');
    var focusEl = null, focusNum = 0;

    days.forEach(function (d, i) {
      var dt = new Date(d.dataset.date + 'T00:00:00');
      if (dt.getTime() === today.getTime()) { focusEl = d; focusNum = i + 1; }

      // Days already behind us start collapsed to a compact summary so the list
      // stays short and today is easy to find. A clear hint invites first-time
      // users to tap them open; tapping toggles the day back and forth.
      if (dt.getTime() < today.getTime()) {
        d.classList.add('past', 'collapsed');
        var hint = document.createElement('div');
        hint.className = 'past-hint';
        hint.innerHTML =
          '<span class="ph-label"></span>' +
          '<svg class="ph-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M6 9l6 6 6-6"/></svg>';
        d.appendChild(hint);
      }

      d.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.notes')) return;
        // A collapsed past day: first tap just expands it (no focus takeover).
        if (d.classList.contains('past')) {
          d.classList.toggle('collapsed');
          setPastHint(d);
          return;
        }
        days.forEach(function (x) { x.classList.remove('focus'); });
        d.classList.add('focus');
      });
    });

    // Keep each past day's hint label in sync with its collapsed/open state.
    function setPastHint(d) {
      var lbl = d.querySelector('.past-hint .ph-label');
      if (lbl) lbl.textContent = I18N.t(d.classList.contains('collapsed') ? 'past_expand' : 'past_collapse');
    }
    days.forEach(function (d) { if (d.classList.contains('past')) setPastHint(d); });

    function fmt(dt) {
      return dt.toLocaleDateString(I18N.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    }
    function setBanner(html) { if (bText) bText.innerHTML = html; }

    if (focusEl) {
      focusEl.classList.add('focus');
      var pills = focusEl.querySelector('.pills');
      if (pills && !pills.querySelector('.pill.today')) {
        var t = document.createElement('span');
        t.className = 'pill today'; t.textContent = I18N.lang === 'it' ? 'Oggi' : 'Today';
        pills.insertBefore(t, pills.firstChild);
      }
      setBanner(I18N.t('banner_today', { date: fmt(today), n: focusNum }));
      if (jump) {
        jump.textContent = I18N.t('jump_today');
        jump.style.display = 'inline';
        jump.onclick = function () { focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      }
      if (!/[#&]d=\d{4}-\d{2}-\d{2}/.test(location.hash)) {
        setTimeout(function () {
          focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
      }
    } else if (today < start) {
      var n = Math.round((start - today) / 86400000);
      setBanner(I18N.t(n === 1 ? 'banner_starts_one' : 'banner_starts_many', { date: fmt(start), n: n }));
      if (days[0]) days[0].classList.add('focus');
    } else if (today > end) {
      setBanner(I18N.t('banner_complete'));
    } else {
      setBanner(I18N.t('banner_today_only', { date: fmt(today) }));
    }
  }

  // Deep-link from a push notification to a specific day. iOS often ignores the
  // notification's target URL, so we also read a target the service worker
  // stashes in a cache on tap, and listen for a message from the SW.
  function jumpToDay(date) {
    var el = document.querySelector('.day[data-date="' + date + '"]');
    if (!el) { dbg('no card for ' + date); return false; }
    Array.prototype.forEach.call(document.querySelectorAll('.day'), function (x) { x.classList.remove('focus'); });
    el.classList.add('focus');
    setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
    dbg('jumped ' + date);
    return true;
  }
  function jumpToHash() {
    var m = (location.hash || '').match(/d=(\d{4}-\d{2}-\d{2})/);
    return m ? jumpToDay(m[1]) : false;
  }
  function clearNavTarget() {
    if ('caches' in window) caches.open('nav-target').then(function (c) { c.delete('t'); }).catch(function () {});
  }
  // Read the day the SW stashed on notification tap and jump to it. Retries a
  // few times because the app can become visible before the cache write lands,
  // and because iOS often resumes a suspended PWA without redelivering the SW
  // message — so this (not the postMessage) is the reliable path on iOS.
  function jumpFromCache(retries) {
    if (!('caches' in window)) return;
    if (typeof retries !== 'number') retries = 2;
    caches.open('nav-target').then(function (c) {
      return c.match('t').then(function (r) {
        if (!r) { if (retries > 0) setTimeout(function () { jumpFromCache(retries - 1); }, 300); return; }
        return r.text().then(function (day) {
          if (day && jumpToDay(day)) c.delete('t');
          else if (retries > 0) setTimeout(function () { jumpFromCache(retries - 1); }, 300);
        });
      });
    }).catch(function () {});
  }
  window.addEventListener('hashchange', jumpToHash);
  // When the app is brought back to the foreground (tapped notification, app
  // switcher), re-check the stashed target — covers the resumed-PWA case.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') jumpFromCache(3);
  });
  window.addEventListener('pageshow', function () { jumpFromCache(2); });
  window.addEventListener('focus', function () { jumpFromCache(1); });
  // Ultimate fallback: iOS sometimes resumes a PWA without firing ANY of the
  // above and without redelivering the SW message. Poll the stashed target
  // while visible; jumpFromCache deletes it once consumed, so this is idempotent.
  setInterval(function () { if (document.visibilityState === 'visible') jumpFromCache(0); }, 1500);
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'go-day' && e.data.day) { dbg('msg go-day ' + e.data.day); jumpToDay(e.data.day); clearNavTarget(); }
    });
  }

  function load(lang) {
    return fetch('itinerary.' + lang + '.html', { cache: 'no-cache' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        MOUNT.innerHTML = html;
        runFocus();
        jumpToHash();
        jumpFromCache();
        document.dispatchEvent(new CustomEvent('itinerary:ready'));
      })
      .catch(function () {
        if (MOUNT) MOUNT.innerHTML =
          '<div class="note"><b>' +
          (lang === 'it' ? 'Impossibile caricare l’itinerario.' : 'Couldn’t load the itinerary.') +
          '</b> ' +
          (lang === 'it'
            ? 'Apri questa pagina una volta con connessione per salvarla offline.'
            : 'Open this page once while online so it can save offline.') +
          '</div>';
      });
  }

  load(I18N.lang);
  I18N.onChange(function (lang) { load(lang); });
})();

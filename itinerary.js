/* itinerary.js — shared by index.html (poster) and read.html (reader).
   Loads the itinerary markup partial for the current language, runs the
   today-auto-focus + tap-to-focus behaviour, then fires `itinerary:ready`
   (each render) so map.js and notes.js can (re)build. Reloads on language change. */
(function () {
  var MOUNT = document.getElementById('itinerary-mount');
  var I18N = window.I18N;

  function runFocus() {
    var days = Array.prototype.slice.call(document.querySelectorAll('.day'));
    var bText = document.getElementById('banner-text');
    var jump = document.getElementById('jump');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date('2026-08-01T00:00:00');
    var end = new Date('2026-08-13T00:00:00');
    var focusEl = null, focusNum = 0;

    days.forEach(function (d, i) {
      var dt = new Date(d.dataset.date + 'T00:00:00');
      if (dt.getTime() === today.getTime()) { focusEl = d; focusNum = i + 1; }
      d.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.notes')) return;
        days.forEach(function (x) { x.classList.remove('focus'); });
        d.classList.add('focus');
      });
    });

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
      setTimeout(function () {
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
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

  function load(lang) {
    return fetch('itinerary.' + lang + '.html', { cache: 'no-cache' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        MOUNT.innerHTML = html;
        runFocus();
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

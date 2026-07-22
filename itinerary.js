/* itinerary.js — shared by index.html (poster) and read.html (reader).
   Loads the itinerary markup partial, injects it, runs the today-auto-focus
   and tap-to-focus behaviour, then fires `itinerary:ready` for notes.js. */
(function () {
  var MOUNT = document.getElementById('itinerary-mount');

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
        // ignore link clicks and anything inside the notes UI
        if (e.target.closest('a')) return;
        if (e.target.closest('.notes')) return;
        days.forEach(function (x) { x.classList.remove('focus'); });
        d.classList.add('focus');
      });
    });

    function fmt(dt) {
      return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    if (!bText) return;

    if (focusEl) {
      focusEl.classList.add('focus');
      var pills = focusEl.querySelector('.pills');
      if (pills && !pills.querySelector('.pill.today')) {
        var t = document.createElement('span');
        t.className = 'pill today'; t.textContent = 'Today';
        pills.insertBefore(t, pills.firstChild);
      }
      bText.innerHTML = 'Today is <b>' + fmt(today) + '</b> · Day ' + focusNum + ' of the trip';
      if (jump) {
        jump.style.display = 'inline';
        jump.addEventListener('click', function () {
          focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
      setTimeout(function () {
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    } else if (today < start) {
      var n = Math.round((start - today) / 86400000);
      bText.innerHTML = 'Trip starts <b>' + fmt(start) + '</b> · ' + n + ' day' + (n === 1 ? '' : 's') + ' to go';
      if (days[0]) days[0].classList.add('focus');
    } else if (today > end) {
      bText.innerHTML = 'Trip complete — <b>welcome home</b>';
    } else {
      bText.innerHTML = 'Today is <b>' + fmt(today) + '</b>';
    }
  }

  function ready() {
    runFocus();
    document.dispatchEvent(new CustomEvent('itinerary:ready'));
  }

  // Fetch the shared markup partial and inject it. Precached by the service
  // worker, so this resolves from cache when offline.
  fetch('itinerary.html', { cache: 'no-cache' })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      MOUNT.innerHTML = html;
      ready();
    })
    .catch(function () {
      if (MOUNT) MOUNT.innerHTML =
        '<div class="note"><b>Couldn’t load the itinerary.</b> ' +
        'Open this page once while online so it can save offline.</div>';
    });
})();

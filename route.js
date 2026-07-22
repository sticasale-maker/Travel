/* route.js — a full-loop route map overlay (bigger version of the per-day mini
   maps). Draws every stop connected in order, highlights today's leg, pins each
   stop. Exposes window.openRouteMap(); the button lives in the stats strip. */
(function () {
  'use strict';
  var TD = window.TRIP_DATA, I18N = window.I18N;
  function t(k) { return I18N ? I18N.t(k) : k; }

  function build() {
    var M = window.AU_MAP;
    if (!M || !TD) return '';
    // ordered stops: origin (Dee Why) then each day's destination (loop back home)
    var stops = [TD.origin];
    var dates = Object.keys(TD.days);
    dates.forEach(function (k) { stops.push(TD.days[k].dest); });

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayNum = 0;
    dates.forEach(function (k) { if (new Date(k + 'T00:00:00') <= today) todayNum = TD.days[k].n; });

    function P(s) { return M.px(s[1]).toFixed(1) + ' ' + M.py(s[0]).toFixed(1); }
    var line = 'M' + stops.map(P).join(' L');
    // today's leg = segment stops[todayNum-1] -> stops[todayNum]
    var todayLeg = '';
    if (todayNum >= 1 && todayNum < stops.length) {
      todayLeg = '<path class="rt-today" d="M' + P(stops[todayNum - 1]) + ' L' + P(stops[todayNum]) + '"/>';
    }
    var pins = stops.map(function (s, i) {
      var cls = (i === todayNum) ? 'rt-pin rt-now' : 'rt-pin';
      var r = (i === todayNum) ? 6.5 : 4;
      return '<circle class="' + cls + '" cx="' + M.px(s[1]).toFixed(1) + '" cy="' + M.py(s[0]).toFixed(1) + '" r="' + r + '"/>';
    }).join('');

    var svg = '<svg viewBox="0 0 ' + Math.ceil(M.W) + ' ' + Math.ceil(M.H) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<path class="au" d="' + M.AU_PATH + '"/><path class="au" d="' + M.TAS_PATH + '"/>' +
      '<path class="rt-line" d="' + line + '"/>' + todayLeg + pins + '</svg>';

    var caption = (todayNum >= 1 && todayNum <= TD.totalDays)
      ? t('route_today') + ' — ' + (TD.days[dates[todayNum - 1]] ? TD.days[dates[todayNum - 1]].dest[2] : '')
      : t('route_full');
    return '<div class="route-box">' + svg + '<div class="route-cap">' + caption + '</div></div>';
  }

  window.openRouteMap = function () {
    var ov = document.createElement('div');
    ov.className = 'overlay route-overlay';
    ov.innerHTML = '<div class="overlay-panel"><button class="overlay-close" type="button" aria-label="Close">✕</button>' +
      '<h3>' + t('route_btn') + '</h3>' + build() + '</div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.overlay-close')) close(); });
  };
})();

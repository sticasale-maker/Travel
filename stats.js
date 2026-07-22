/* stats.js — trip progress strip: day X of N, km so far, states, progress bar,
   pre-trip countdown, milestone chips, and buttons to open the route map / photo
   wall. Renders into #trip-stats; re-renders on language change. */
(function () {
  'use strict';
  var TD = window.TRIP_DATA, I18N = window.I18N;
  if (!TD) return;
  function t(k, v) { return I18N ? I18N.t(k, v) : k; }
  function it() { return I18N && I18N.lang === 'it'; }

  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function dstr(d) { return d.toISOString().slice(0, 10); }

  function render() {
    var host = document.getElementById('trip-stats');
    if (!host) return;
    var today = today0();
    var start = new Date(TD.start + 'T00:00:00'), end = new Date(TD.end + 'T00:00:00');
    var msDay = 86400000;

    // km + states accumulated up to and including today
    var kmSoFar = 0, states = {}, dayNum = 0;
    Object.keys(TD.days).forEach(function (k) {
      var day = TD.days[k], dt = new Date(k + 'T00:00:00');
      if (dt <= today) { kmSoFar += day.km; states[day.state] = 1; dayNum = Math.max(dayNum, day.n); }
    });
    var stateCount = Object.keys(states).length;
    var pct, headline;

    if (today < start) {
      var n = Math.round((start - today) / msDay);
      pct = 0;
      headline = '<b>' + n + '</b> ' + t(n === 1 ? 'days_to_go_one' : 'days_to_go') + ' · ' +
        t('total_km', { km: TD.totalKm.toLocaleString() });
    } else if (today > end) {
      pct = 100;
      headline = t('loop_closed') + ' · <b>' + TD.totalKm.toLocaleString() + '</b> km · ' + t('welcome_home');
    } else {
      pct = Math.round(kmSoFar / TD.totalKm * 100);
      headline = t('day_of', { n: '<b>' + dayNum + '</b>', total: TD.totalDays }) +
        ' · ~<b>' + kmSoFar.toLocaleString() + '</b> km · ' +
        t(stateCount === 1 ? 'states_n_one' : 'states_n', { n: stateCount });
    }

    // milestones
    var mHtml = TD.milestones.map(function (m) {
      var reached = new Date(m.date + 'T00:00:00') <= today;
      return '<span class="ms-chip' + (reached ? ' on' : '') + '" title="' + (it() ? m.it : m.en) + '">' +
        m.emoji + '<span class="ms-label">' + (it() ? m.it : m.en) + '</span></span>';
    }).join('');

    host.innerHTML =
      '<div class="stats-top">' +
        '<div class="stats-headline">' + headline + '</div>' +
        '<div class="stats-actions">' +
          '<button type="button" class="stat-btn" data-act="route">🗺 ' + t('route_btn') + '</button>' +
          '<button type="button" class="stat-btn" data-act="photos">🖼 ' + t('photos_btn') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="stats-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="ms-row">' + mHtml + '</div>';

    var r = host.querySelector('[data-act="route"]');
    var p = host.querySelector('[data-act="photos"]');
    if (r) r.onclick = function () { if (window.openRouteMap) window.openRouteMap(); };
    if (p) p.onclick = function () { if (window.openGallery) window.openGallery(); };
  }

  function init() { render(); if (I18N && I18N.onChange) I18N.onChange(render); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

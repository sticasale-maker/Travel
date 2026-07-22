/* weather.js — replace each day's static August averages with a live forecast
   from Open-Meteo (free, no key) when the date is within the ~16-day horizon and
   there's signal. Falls back silently to the static block otherwise. */
(function () {
  'use strict';
  var TD = window.TRIP_DATA, I18N = window.I18N;
  if (!TD) return;
  var cache = null; // { fetchedAt, data: { date: {tmax,tmin,code,sunrise,sunset} } }

  try { cache = JSON.parse(localStorage.getItem('travel_wx') || 'null'); } catch (e) {}

  function lang() { return I18N ? I18N.lang : 'en'; }
  function hm(iso) { return iso ? iso.slice(11, 16).replace(/^0/, '') : ''; }
  function cond(code) {
    var i = lang() === 'it';
    if (code === 0) return i ? 'Sereno' : 'Clear';
    if (code <= 3) return i ? 'Poco nuvoloso' : 'Partly cloudy';
    if (code <= 48) return i ? 'Nebbia' : 'Fog';
    if (code <= 57) return i ? 'Pioviggine' : 'Drizzle';
    if (code <= 67) return i ? 'Pioggia' : 'Rain';
    if (code <= 77) return i ? 'Neve' : 'Snow';
    if (code <= 82) return i ? 'Rovesci' : 'Showers';
    if (code <= 86) return i ? 'Neve' : 'Snow showers';
    return i ? 'Temporale' : 'Storm';
  }
  function chips(w) {
    var cold = w.tmin <= 5 ? ' cold' : '';
    return '<span class="chip' + cold + '"><svg width="14" height="14"><use href="#i-sun"/></svg>' +
        '<span class="hi">' + Math.round(w.tmax) + '°</span> / <span class="lo">' + Math.round(w.tmin) + '°</span></span>' +
      '<span class="chip"><svg width="13" height="13"><use href="#i-sunrise"/></svg>' + hm(w.sunrise) + '</span>' +
      '<span class="chip"><svg width="13" height="13"><use href="#i-sunset"/></svg>' + hm(w.sunset) + '</span>' +
      '<span class="chip">' + cond(w.code) + '</span>' +
      '<span class="chip wx-live">' + (lang() === 'it' ? 'live' : 'live') + '</span>';
  }

  function apply() {
    if (!cache || !cache.data) return;
    document.querySelectorAll('.day').forEach(function (d) {
      var w = cache.data[d.dataset.date], wx = d.querySelector('.wx');
      if (w && wx) wx.innerHTML = chips(w);
    });
  }

  function fetchWx() {
    if (!navigator.onLine) return;
    var lats = [], lngs = [], dates = [];
    Object.keys(TD.days).forEach(function (k) { lats.push(TD.days[k].dest[0]); lngs.push(TD.days[k].dest[1]); dates.push(k); });
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lats.join(',') +
      '&longitude=' + lngs.join(',') +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=16';
    fetch(url).then(function (r) { return r.json(); }).then(function (res) {
      var arr = Array.isArray(res) ? res : [res];
      var data = {};
      arr.forEach(function (loc, i) {
        if (!loc || !loc.daily || !loc.daily.time) return;
        var idx = loc.daily.time.indexOf(dates[i]);
        if (idx < 0) return;
        data[dates[i]] = {
          tmax: loc.daily.temperature_2m_max[idx], tmin: loc.daily.temperature_2m_min[idx],
          code: loc.daily.weather_code[idx], sunrise: loc.daily.sunrise[idx], sunset: loc.daily.sunset[idx]
        };
      });
      if (Object.keys(data).length) {
        cache = { fetchedAt: new Date().toISOString(), data: data };
        try { localStorage.setItem('travel_wx', JSON.stringify(cache)); } catch (e) {}
        apply();
      }
    }).catch(function () {});
  }

  function run() {
    apply(); // instant from cache (works offline)
    var stale = !cache || !cache.fetchedAt || (Date.now() - new Date(cache.fetchedAt).getTime() > 3 * 3600000);
    if (navigator.onLine && stale) fetchWx();
  }

  document.addEventListener('itinerary:ready', run);
  if (document.querySelector('.day')) run();
})();

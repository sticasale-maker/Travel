/* map.js — a little Australia map on each day card showing that day's leg.
   The whole map is a link to Google Maps (directions for a drive, a pin if
   stationary). Being an <a>, the card's tap-to-focus handler ignores it.
   Shared by index.html (poster) and read.html (reader). */
(function () {
  'use strict';

  // --- equirectangular projection tuned to the Australian mainland ---------
  var LNG_MIN = 112, LAT_N = -10, S = 10;
  var KX = Math.cos(25 * Math.PI / 180); // shrink longitude at ~25°S
  var W = (154 - LNG_MIN) * KX * S;       // ~380.6
  var H = (LAT_N - (-44)) * S;            // 340
  function px(lng) { return (lng - LNG_MIN) * KX * S; }
  function py(lat) { return (LAT_N - lat) * S; }

  // Coastline traced clockwise from Cape York (lat, lng). Decorative, not survey-grade.
  var OUTLINE = [
    [-10.7,142.5],[-15.5,145.3],[-16.9,145.8],[-19.3,146.8],[-21.1,149.2],
    [-23.4,150.9],[-25.3,153.1],[-27.5,153.2],[-28.6,153.6],[-30.3,153.1],
    [-33.9,151.3],[-37.1,149.9],[-37.8,148.5],[-39.1,146.4],[-38.4,144.9],
    [-38.9,143.5],[-38.0,140.7],[-35.6,138.1],[-34.7,135.9],[-32.8,134.2],
    [-31.5,131.2],[-31.7,128.9],[-33.9,121.9],[-35.0,117.9],[-34.4,115.1],
    [-32.0,115.7],[-28.8,114.6],[-24.9,113.7],[-21.8,114.1],[-20.3,118.6],
    [-17.95,122.2],[-16.4,123.0],[-14.8,128.1],[-12.4,130.8],[-12.0,133.0],
    [-12.2,136.8],[-14.7,135.5],[-17.6,140.8],[-12.6,141.9]
  ];
  var TASMANIA = [[-40.7,144.7],[-41.0,148.3],[-43.6,147.9],[-43.5,146.0]];

  function poly(pts) {
    return 'M' + pts.map(function (p) {
      return px(p[1]).toFixed(1) + ' ' + py(p[0]).toFixed(1);
    }).join(' L') + ' Z';
  }
  var AU_PATH = poly(OUTLINE);
  var TAS_PATH = poly(TASMANIA);

  // --- the day legs: [lat, lng, "Maps place name"] -------------------------
  var LEGS = {
    '2026-08-01': { from: [-33.75,151.29,'Dee Why NSW'],        to: [-31.50,145.84,'Cobar NSW'] },
    '2026-08-02': { from: [-31.50,145.84,'Cobar NSW'],          to: [-31.96,141.47,'Broken Hill NSW'] },
    '2026-08-03': { from: [-31.96,141.47,'Broken Hill NSW'],    to: [-31.90,141.22,'Silverton NSW'], daytrip: true },
    '2026-08-04': { from: [-31.96,141.47,'Broken Hill NSW'],    to: [-31.24,136.79,'Pimba SA'] },
    '2026-08-05': { from: [-31.24,136.79,'Pimba SA'],           to: [-29.01,134.75,'Coober Pedy SA'] },
    '2026-08-06': { from: [-29.01,134.75,'Coober Pedy SA'],     to: [-24.42,131.83,'Kings Creek Station NT'] },
    '2026-08-07': { from: [-24.26,131.57,'Kings Canyon NT'],    to: [-23.68,132.92,'Redbank Gorge NT'] },
    '2026-08-08': { from: [-23.68,132.92,'Redbank Gorge NT'],   to: [-23.77,133.06,'Ellery Creek Big Hole NT'] },
    '2026-08-09': { from: [-23.77,133.06,'Ellery Creek Big Hole NT'], to: [-23.70,133.88,'Alice Springs NT'] },
    '2026-08-10': { from: [-23.70,133.88,'Alice Springs NT'],   to: [-27.30,133.62,'Marla SA'] },
    '2026-08-11': { from: [-27.30,133.62,'Marla SA'],           to: [-32.49,137.77,'Port Augusta SA'] },
    '2026-08-12': { from: [-32.49,137.77,'Port Augusta SA'],    to: [-34.51,144.84,'Hay NSW'] },
    '2026-08-13': { from: [-34.51,144.84,'Hay NSW'],            to: [-33.75,151.29,'Dee Why NSW'] }
  };

  function shortName(n) {
    return n.replace(/ (NSW|SA|NT|VIC|QLD|WA|TAS|Station)$/i, '');
  }
  function coord(p) { return p[0] + ',' + p[1]; }

  // A leg counts as "stationary" when start and end are within ~15 km.
  function isStationary(f, t) {
    var dLat = (f[0] - t[0]) * 111;
    var dLng = (f[1] - t[1]) * 111 * KX;
    return Math.sqrt(dLat * dLat + dLng * dLng) < 15;
  }

  function mapsUrl(f, t, stationary) {
    if (stationary) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t[2]);
    }
    return 'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(coord(f)) + '&destination=' + encodeURIComponent(coord(t)) +
      '&travelmode=driving';
  }

  function buildMap(leg) {
    var f = leg.from, t = leg.to;
    var stationary = !leg.daytrip && isStationary(f, t);
    var fx = px(f[1]).toFixed(1), fy = py(f[0]).toFixed(1);
    var tx = px(t[1]).toFixed(1), ty = py(t[0]).toFixed(1);

    var marks;
    if (stationary) {
      marks = '<circle class="p-pulse" cx="' + tx + '" cy="' + ty + '" r="15"/>' +
              '<circle class="p-solo" cx="' + tx + '" cy="' + ty + '" r="8"/>';
    } else {
      marks = '<path class="route" d="M' + fx + ' ' + fy + ' L' + tx + ' ' + ty + '"/>' +
              '<circle class="p-from" cx="' + fx + '" cy="' + fy + '" r="6.5"/>' +
              '<circle class="p-to" cx="' + tx + '" cy="' + ty + '" r="8"/>';
    }

    var t18 = (window.I18N && window.I18N.t) ? window.I18N.t.bind(window.I18N) : function (k) { return k; };
    var cap = stationary
      ? '<span class="daymap-cap">' + escapeText(shortName(t[2])) +
        '<span class="hint">' + escapeText(t18('map_pin')) + '</span></span>'
      : '<span class="daymap-cap">' + escapeText(shortName(f[2])) +
        ' <span class="arr">→</span> ' + escapeText(shortName(t[2])) +
        '<span class="hint">' + escapeText(t18('map_directions')) + '</span></span>';

    var a = document.createElement('a');
    a.className = 'daymap';
    a.href = mapsUrl(f, t, stationary);
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', stationary
      ? 'Open ' + shortName(t[2]) + ' in Google Maps'
      : 'Directions from ' + shortName(f[2]) + ' to ' + shortName(t[2]) + ' in Google Maps');
    a.innerHTML =
      '<svg viewBox="0 0 ' + Math.ceil(W) + ' ' + Math.ceil(H) + '" ' +
        'xmlns="http://www.w3.org/2000/svg" role="img">' +
        '<path class="au" d="' + AU_PATH + '"/>' +
        '<path class="au" d="' + TAS_PATH + '"/>' +
        marks +
      '</svg>' + cap;
    return a;
  }

  function escapeText(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function render() {
    document.querySelectorAll('.day').forEach(function (dayEl) {
      if (dayEl.querySelector('.daymap')) return; // idempotent
      var leg = LEGS[dayEl.dataset.date];
      if (!leg) return;
      var el = buildMap(leg);
      // Insert right after the day-number row so it floats top-right and the
      // destination name + details wrap down its left side.
      var top = dayEl.querySelector('.toprow');
      if (top) top.insertAdjacentElement('afterend', el);
      else dayEl.insertBefore(el, dayEl.firstChild);
    });
  }

  // Runs on every (re)render of the itinerary — including language switches.
  document.addEventListener('itinerary:ready', render);
  if (document.querySelector('.day')) render();
})();

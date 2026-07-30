/* enrich.js — per-day enrichment layer over the itinerary cards:
   • a destination photo (Wikimedia, cached offline by the service worker once seen)
   • a compact highlights strip of category icons
   • a collapsible "Things to do" checklist, each item flaggable Yes/No
     (flags sync across phones via Supabase, with a localStorage fallback + offline queue)
   • a collapsible "Eat & drink" list with star ratings, at the stop and along the way
   Keyed by data-date so it works in both the English and Italian partials.
   Runs on every itinerary (re)render (incl. language switches). */
(function () {
  'use strict';
  var I18N = window.I18N;
  function t(k, v) { return I18N ? I18N.t(k, v) : k; }
  function it() { return I18N && I18N.lang === 'it'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mapUrl(q) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  // ---- category / kind icons (inner SVG markup, stroke style) --------------
  var IC = {
    walk: '<path d="M4 20h4l2-6 2 2 1 4h3M9 6.5a1.4 1.4 0 1 0 0-.01M8 14l2-5 3 1 2 3"/>',
    swim: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><circle cx="15" cy="6.5" r="1.6"/><path d="M6 12l4-3 4 2"/>',
    lookout: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
    wildlife: '<ellipse cx="12" cy="15" rx="3.6" ry="3"/><circle cx="6.6" cy="11" r="1.6"/><circle cx="10" cy="7.6" r="1.6"/><circle cx="14" cy="7.6" r="1.6"/><circle cx="17.4" cy="11" r="1.6"/>',
    heritage: '<path d="M4 9h16M5 9l7-4 7 4M6 9v8M10 9v8M14 9v8M18 9v8M4 20h16"/>',
    mine: '<path d="M4 20l8-8M6 10c4-4 9-5 14-3M18 5c-2 4-4 6-8 8"/>',
    drive: '<path d="M5 13l1.4-4.2A2 2 0 0 1 8.3 7.4h7.4a2 2 0 0 1 1.9 1.4L19 13M5 13h14v4H5zM7 17v1.5M17 17v1.5"/><circle cx="7.5" cy="14.6" r="1"/><circle cx="16.5" cy="14.6" r="1"/>',
    garden: '<path d="M12 21v-8M12 13c-3 .3-5.5-1.6-5.8-4.4C9 8.3 11.5 10 12 13zM12 12c.4-3 2.8-4.7 5.8-4.4C17.6 10.4 15.1 12.4 12 12z"/>',
    art: '<path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-2 0-1.4 1-2 2-2h1a4 4 0 0 0 4-4c0-5-4-8-9-8z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="11" r="1"/>',
    church: '<path d="M12 3v6M9.5 6h5M6 21V11l6-4 6 4v10M4 21h16M10.5 21v-4h3v4"/>',
    star: '<path d="M12 3.2l2.5 5.4 5.9.6-4.4 4 1.2 5.8L12 16.9 6.8 19l1.2-5.8-4.4-4 5.9-.6z"/>',
    science: '<path d="M12 2c2.6 2 4 5 4 8.5 0 1.8-.6 3.3-1.4 4.5H9.4C8.6 13.8 8 12.3 8 10.5 8 7 9.4 4 12 2z"/><circle cx="12" cy="9" r="1.5"/><path d="M9.4 15l-2.4 3 3-1.2M14.6 15l2.4 3-3-1.2M10.5 18.6h3"/>',
    eat: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M16 3c-1.6 0-2.5 2-2.5 5s1 4 2.5 4v9"/>',
    cafe: '<path d="M4 8h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zM17 9h2a2 2 0 0 1 0 4h-2M7 3v2M10 3v2M13 3v2"/>',
    pub: '<path d="M6 8h9v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8zM15 10h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3M6 8V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v2"/>',
    bakery: '<path d="M5 11a4 4 0 0 1 4-4h6a4 4 0 0 1 0 8H9a4 4 0 0 1-4-4zM9 7.5v7M13 7.5v7"/>',
    roadhouse: '<path d="M5 21V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v15M4 21h11M7 8h4M13 9.5l3 2.5V17a1.5 1.5 0 0 0 3 0V7.5L16.5 5"/>',
    station: '<path d="M4 11l8-6 8 6M6 10v10h12V10M10 20v-5h4v5"/>',
    camp: '<path d="M12 4 3 20h18L12 4zM12 4v16"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/>',
    pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    signal: '<path d="M4 20v-3M9 20v-6M14 20v-10M19 20v-14"/>'
  };
  function icon(k, cls) {
    return '<svg class="ei' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (IC[k] || IC.star) + '</svg>';
  }
  var KIND_IC = { cafe: 'cafe', restaurant: 'eat', pub: 'pub', bakery: 'bakery', roadhouse: 'roadhouse', station: 'station' };
  var CAT_LABEL = {
    walk: ['Walk', 'Camminata'], swim: ['Swim', 'Nuoto'], lookout: ['Lookout', 'Belvedere'],
    wildlife: ['Wildlife', 'Fauna'], heritage: ['Heritage', 'Storia'], mine: ['Mining', 'Miniera'],
    drive: ['Scenic drive', 'Strada panoramica'], garden: ['Garden', 'Giardino'], art: ['Art & culture', 'Arte e cultura'],
    church: ['Churches', 'Chiese'], star: ['Landmark', 'Simbolo'], science: ['Rocket range', 'Poligono'],
    camp: ['Camp night', 'Notte in tenda'], eat: ['Eat & drink', 'Mangiare e bere']
  };
  function catLabel(c) { var l = CAT_LABEL[c]; return l ? (it() ? l[1] : l[0]) : c; }

  // ---- light localization of hours / price strings (times stay universal) --
  var DAY_IT = { Mon: 'Lun', Tue: 'Mar', Wed: 'Mer', Thu: 'Gio', Fri: 'Ven', Sat: 'Sab', Sun: 'Dom' };
  function localizeHours(s) {
    if (!it() || !s) return s;
    return s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, function (m) { return DAY_IT[m]; })
      .replace(/\bDaily\b/g, 'Tutti i giorni').replace(/\b24\/7\b/g, 'Sempre aperto')
      .replace(/\bBy booking\b/g, 'Su prenotazione').replace(/\bTours\b/g, 'Visite')
      .replace(/\bfee\b/g, 'a pagamento').replace(/\bPH\b/g, 'festivi').replace(/\blate\b/g, 'tardi');
  }
  function localizePrice(s) {
    if (!it() || !s) return s;
    return s.replace(/\bmains\b/g, 'piatti').replace(/\blight meals\b/g, 'piatti leggeri')
      .replace(/\bcounter meals\b/g, 'piatti al banco').replace(/\bsnacks\b/g, 'spuntini');
  }
  var COV_LVL = { good: ['Good', 'Buono'], patchy: ['Patchy', 'A tratti'], none: ['No signal', 'Assente'] };
  function coverageHTML(c) {
    if (!c) return '';
    function badge(carrier, who, lvl) {
      var L = COV_LVL[lvl] || ['', ''];
      return '<span class="cov-item cov-' + lvl + '"><b>' + carrier + '</b> · ' + esc(who) +
        ' <span class="cov-lvl">' + (it() ? L[1] : L[0]) + '</span></span>';
    }
    return '<div class="coverage">' + icon('signal', 'cov-ic') +
      badge('Telstra', 'Marco', c.telstra) +
      badge('Optus', 'Giulia & Vittoria', c.optus) +
      (c.note ? '<span class="cov-note">' + esc(c.note) + '</span>' : '') + '</div>';
  }
  function hoursHTML(h) {
    return h ? '<span class="ti-hours">' + icon('clock') + esc(localizeHours(h)) + '</span>' : '';
  }

  // ---- star rating --------------------------------------------------------
  function revNum(n) { return n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : ('' + n); }
  function reviewCount(n) { return n ? '<span class="s-count">(' + revNum(n) + ')</span>' : ''; }
  function rating(r, n) {
    var m = String(r || '').match(/(\d(?:\.\d)?)/);
    if (!m) {
      if (n) return '<span class="rev">' + icon('star', 'rev-i') + revNum(n) + ' ' + esc(it() ? 'recensioni' : 'reviews') + '</span>';
      return r ? '<span class="rev">' + icon('star', 'rev-i') + esc(it() ? 'ben recensito' : 'well-reviewed') + '</span>' : '';
    }
    var v = parseFloat(m[1]), pct = Math.max(0, Math.min(100, v / 5 * 100));
    return '<span class="stars" title="' + v + '/5" aria-label="' + v + ' out of 5">' +
      '<span class="s-b">★★★★★</span>' +
      '<span class="s-f" style="width:' + pct.toFixed(0) + '%">★★★★★</span>' +
      '</span><span class="s-n">' + v.toFixed(1) + '</span>' + reviewCount(n);
  }

  // ---- flag store (localStorage + Supabase sync) --------------------------
  var LKEY = 'trip_flags_v1', PKEY = 'trip_flags_pending', sb = null;
  function jload(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  function jsave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var flags = jload(LKEY), pending = jload(PKEY);
  function nowISO() { return new Date().toISOString(); }
  function author() { try { return localStorage.getItem('travel_author') || ''; } catch (e) { return ''; } }
  function flagOf(id) { return (flags[id] && flags[id].v) || ''; }

  function mergeRow(r) {
    if (!r || !r.item_id) return;
    var cur = flags[r.item_id];
    if (!cur || (r.updated_at || '') >= (cur.t || '')) {
      flags[r.item_id] = { v: r.value || '', t: r.updated_at || nowISO(), by: r.set_by || '' };
      jsave(LKEY, flags);
    }
  }
  function pull() {
    if (!sb) return;
    sb.from('trip_flags').select('*').then(function (res) {
      if (res && res.data) { res.data.forEach(mergeRow); paint(); }
    }).catch(function () {});
  }
  function flush() {
    if (!sb || !navigator.onLine) return;
    Object.keys(pending).forEach(function (id) {
      var f = flags[id];
      if (!f) { delete pending[id]; return; }
      sb.from('trip_flags').upsert({ item_id: id, value: f.v, set_by: f.by || author(), updated_at: f.t })
        .then(function (res) { if (res && !res.error) { delete pending[id]; jsave(PKEY, pending); } })
        .catch(function () {});
    });
  }
  function setFlag(id, val) {
    var nv = flagOf(id) === val ? '' : val;      // tap the active choice again to clear it
    flags[id] = { v: nv, t: nowISO(), by: author() };
    jsave(LKEY, flags);
    pending[id] = 1; jsave(PKEY, pending);
    paintItem(id);
    flush();
  }
  function initSb() {
    var CFG = window.TRAVEL_CONFIG || {};
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.indexOf('YOUR-') > -1) return;
    if (!window.supabase || !window.supabase.createClient) return;
    try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } }); }
    catch (e) { return; }
    pull(); flush();
    try {
      sb.channel('trip_flags')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_flags' },
          function (p) { mergeRow(p.new || p.old); paint(); })
        .subscribe();
    } catch (e) {}
  }
  window.addEventListener('online', function () { flush(); pull(); });

  function applyState(el) {
    var v = flagOf(el.getAttribute('data-flag'));
    el.querySelectorAll('.flag-btn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-val') === v); });
    var li = el.closest('.todo-item');
    if (li) { li.classList.toggle('is-yes', v === 'yes'); li.classList.toggle('is-no', v === 'no'); }
  }
  function paint() { document.querySelectorAll('[data-flag]').forEach(applyState); }
  function paintItem(id) {
    document.querySelectorAll('[data-flag]').forEach(function (el) {
      if (el.getAttribute('data-flag') === id) applyState(el);
    });
  }

  // ---- stargazing (moon phase + sky darkness) for camp nights ------------
  var MOON_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  var MOON_EN = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
    'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  var MOON_IT = ['Luna nuova', 'Falce crescente', 'Primo quarto', 'Gibbosa crescente',
    'Luna piena', 'Gibbosa calante', 'Ultimo quarto', 'Falce calante'];
  // Approximate moon phase for the evening (~20:00 local) of the given date.
  function moon(dateStr) {
    var d = new Date(dateStr + 'T20:00:00');
    var synodic = 29.530588853;
    var ref = Date.UTC(2000, 0, 6, 18, 14, 0);   // a known new moon (2000-01-06)
    var frac = ((d.getTime() - ref) / 86400000) / synodic;
    frac = frac - Math.floor(frac);              // 0..1 through the lunar cycle
    return { frac: frac, illum: (1 - Math.cos(2 * Math.PI * frac)) / 2 };
  }
  function darkness(illum) {
    if (illum < 0.15) return { lvl: 1, en: 'Superb — near-new moon, pitch-black sky, Milky Way blazing', it: 'Eccezionale — quasi luna nuova, cielo nerissimo, Via Lattea splendente' };
    if (illum < 0.45) return { lvl: 2, en: 'Excellent — dark skies, great for stars', it: 'Ottimo — cieli bui, perfetti per le stelle' };
    if (illum < 0.72) return { lvl: 3, en: 'Good — some moonlight about', it: 'Buono — un po’ di chiaro di luna' };
    return { lvl: 4, en: 'Bright moon — faint stars washed out (fine for moonlit views)', it: 'Luna intensa — stelle deboli sbiadite (bello il paesaggio illuminato)' };
  }
  // Celestial events worth looking up for, dated to the trip window (late Jul –
  // mid Aug 2026) and framed for the Southern Hemisphere / outback dark skies.
  var SKY_EVENTS = [
    { from: '2026-07-31', to: '2026-08-13', emoji: '🌌',
      en: 'Milky Way core straight overhead after dark — winter is the best time to see it',
      it: 'Il cuore della Via Lattea allo zenit dopo il tramonto — l’inverno è il periodo migliore' },
    { from: '2026-07-31', to: '2026-08-20', emoji: '☄️',
      en: 'Southern δ-Aquariid meteors — a steady shower, superb from the outback',
      it: 'Meteore δ-Aquaridi del Sud — sciame costante, spettacolare nell’outback' },
    { from: '2026-07-31', to: '2026-08-15', emoji: '🔥',
      en: 'α-Capricornid meteors — only a few an hour, but slow, bright fireballs',
      it: 'Meteore α-Capricornidi — poche all’ora, ma lente e luminose' },
    { from: '2026-08-09', to: '2026-08-13', emoji: '🌠',
      en: 'Perseids building to their 12–13 Aug peak — low on the northern horizon before dawn from here',
      it: 'Perseidi verso il picco del 12–13 ago — basse sull’orizzonte nord prima dell’alba da qui' },
    { from: '2026-07-31', to: '2026-08-13', emoji: '🪐',
      en: 'Saturn well up by late evening — a small telescope shows its rings',
      it: 'Saturno alto a tarda sera — un piccolo telescopio ne mostra gli anelli' }
  ];
  function eventsFor(dateStr) {
    return SKY_EVENTS.filter(function (e) { return dateStr >= e.from && dateStr <= e.to; });
  }
  function starHTML(dateStr) {
    var m = moon(dateStr), idx = Math.floor(m.frac * 8 + 0.5) % 8;
    var dk = darkness(m.illum), pct = Math.round(m.illum * 100);
    var evs = eventsFor(dateStr);
    var evHTML = evs.length ? '<ul class="sg-events">' + evs.map(function (e) {
      return '<li><span class="sg-ev-ic">' + e.emoji + '</span>' + esc(it() ? e.it : e.en) + '</li>';
    }).join('') + '</ul>' : '';
    return '<div class="stargaze sg-l' + dk.lvl + '">' +
      '<div class="sg-head">' +
        '<div class="sg-moon">' + MOON_EMOJI[idx] + '</div>' +
        '<div class="sg-main">' +
          '<div class="sg-title">' + esc(t('star_title')) + '</div>' +
          '<div class="sg-sub">' + esc(it() ? MOON_IT[idx] : MOON_EN[idx]) + ' · ' + pct + '% ' + esc(t('star_lit')) + '</div>' +
          '<div class="sg-dark">' + esc(it() ? dk.it : dk.en) + '</div>' +
        '</div>' +
      '</div>' + evHTML +
      '</div>';
  }

  // ---- render -------------------------------------------------------------
  function photoHTML(p) {
    var cap = esc(p.credit || '') + (p.license ? ' · ' + esc(p.license) : '');
    return '<figure class="day-photo"><img loading="lazy" alt="' + esc(p.alt || '') + '" src="' + esc(p.url) + '">' +
      (cap ? '<figcaption>' + cap + ' · Wikimedia</figcaption>' : '') + '</figure>';
  }
  function warnHTML(w) {
    return '<p class="day-warn">⚠️ <span>' + esc(it() ? w.it : w.en) + '</span></p>';
  }
  function linkHTML(l) {
    return '<a class="drive-link" target="_blank" rel="noopener" href="' + esc(l.url) + '">' +
      icon('drive') + '<span>' + esc(it() ? l.it : l.en) + '</span>' + icon('pin', 'dl-go') + '</a>';
  }
  function isRoute(x) { return !!x.where; }
  function whereTag(x) {
    return x.where ? '<span class="rt-where">' + icon('pin', 'rt-pin') + esc(x.where) + '</span>' : '';
  }
  function driveTag(x) {
    return x.t ? '<span class="rt-time" title="' + (it() ? 'Tempo di guida dalla partenza di oggi' : 'Drive time from today’s start') + '">' +
      icon('drive', 'rt-car') + '~' + esc(x.t) + '</span>' : '';
  }
  function todoItemHTML(date, x) {
    var id = date + ':' + x.id;
    return '<li class="todo-item"><span class="ti-ic">' + icon(x.cat) + '</span>' +
      '<div class="ti-main"><span class="ti-name">' + esc(x.name) + '</span>' + driveTag(x) + whereTag(x) +
      (x.dur ? '<span class="ti-dur">' + icon('clock') + esc(x.dur) + '</span>' : '') +
      '<span class="ti-blurb">' + esc(it() ? x.it : x.en) + '</span>' + hoursHTML(x.hours) + '</div>' +
      '<span class="flag-yn" data-flag="' + esc(id) + '">' +
        '<button type="button" class="flag-btn yes" data-val="yes">' + esc(t('flag_yes')) + '</button>' +
        '<button type="button" class="flag-btn no" data-val="no">' + esc(t('flag_no')) + '</button>' +
      '</span>' +
      (x.q ? '<a class="ti-map" target="_blank" rel="noopener" href="' + mapUrl(x.q) + '" aria-label="Map">' + icon('pin') + '</a>' : '') +
      '</li>';
  }
  function foodRow(f) {
    return '<li class="food-item"><span class="fi-ic">' + icon(KIND_IC[f.kind] || 'eat') + '</span>' +
      '<div class="fi-main"><span class="fi-name">' + esc(f.name) + '</span> ' + rating(f.rating, f.n) +
      (f.avg ? ' <span class="fi-price">' + esc(localizePrice(f.avg)) + '</span>' : '') + driveTag(f) + whereTag(f) +
      '<span class="fi-blurb">' + esc(it() ? f.it : f.en) + '</span>' + hoursHTML(f.hours) + '</div>' +
      (f.q ? '<a class="ti-map" target="_blank" rel="noopener" href="' + mapUrl(f.q) + '" aria-label="Map">' + icon('pin') + '</a>' : '') +
      '</li>';
  }
  function todoHTML(date, list) {
    return '<details class="ex todo-ex"><summary>' + icon('check') + '<span>' + esc(t('todo_title')) +
      '</span><span class="ex-count">' + list.length + '</span></summary>' +
      '<ul class="todo-list">' + list.map(function (x) { return todoItemHTML(date, x); }).join('') + '</ul></details>';
  }
  function foodHTML(list) {
    return '<details class="ex food-ex"><summary>' + icon('eat') + '<span>' + esc(t('food_title')) +
      '</span><span class="ex-count">' + list.length + '</span></summary>' +
      '<ul class="food-list">' + list.map(foodRow).join('') + '</ul></details>';
  }
  // "On the way to X": route attractions + eateries, in the order you pass them.
  function onwayHTML(date, items, dest) {
    var rows = items.map(function (x) { return x.kind ? foodRow(x) : todoItemHTML(date, x); }).join('');
    return '<details class="ex onway-ex"><summary>' + icon('drive') + '<span>' + esc(t('onway_title', { dest: dest })) +
      '</span><span class="ex-count">' + items.length + '</span></summary>' +
      '<ul class="todo-list onway-list">' + rows + '</ul></details>';
  }
  function destName(day) {
    var p = day.querySelector('.place'); if (!p) return '';
    var c = p.cloneNode(true), lead = c.querySelector('.lead'); if (lead) lead.parentNode.removeChild(lead);
    return c.textContent.trim();
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('.flag-btn') : null;
    if (b) {
      e.preventDefault();
      var w = b.closest('[data-flag]');
      if (w) setFlag(w.getAttribute('data-flag'), b.getAttribute('data-val'));
    }
    e.stopPropagation();          // keep the day card's tap-to-focus from firing
  }

  function render() {
    var DATA = window.TRIP_ENRICH || {};
    document.querySelectorAll('.day').forEach(function (day) {
      if (day.querySelector('.day-enrich')) return;
      var d = DATA[day.dataset.date];
      if (!d) return;
      var el = document.createElement('div');
      el.className = 'day-enrich';
      var html = '';
      if (d.photo) html += photoHTML(d.photo);
      if (d.warn) html += warnHTML(d.warn);
      if (day.classList.contains('camp')) html += starHTML(day.dataset.date);
      if (d.coverage) html += coverageHTML(d.coverage);
      if (d.link) html += linkHTML(d.link);
      var todo = d.todo || [], food = d.food || [];
      var routeItems = todo.filter(isRoute).concat(food.filter(isRoute));
      var todoDest = todo.filter(function (x) { return !isRoute(x); });
      var foodDest = food.filter(function (x) { return !isRoute(x); });
      if (routeItems.length) html += onwayHTML(day.dataset.date, routeItems, destName(day));
      if (todoDest.length) html += todoHTML(day.dataset.date, todoDest);
      if (foodDest.length) html += foodHTML(foodDest);
      el.innerHTML = html;
      var img = el.querySelector('.day-photo img');
      if (img) img.addEventListener('error', function () { var f = img.closest('.day-photo'); if (f) f.style.display = 'none'; });
      el.addEventListener('click', onClick);
      var notes = day.querySelector('.notes');
      if (notes) day.insertBefore(el, notes); else day.appendChild(el);
    });
    paint();
  }

  document.addEventListener('itinerary:ready', render);
  if (window.TRIP_ENRICH && document.querySelector('.day')) render();
  initSb();
})();

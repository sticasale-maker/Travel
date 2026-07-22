/* features.js — a small line icon of each destination's most iconic feature,
   placed beside the place name. Keyed by data-date so it works in both the
   English and Italian itinerary partials without editing their markup.
   Runs on every itinerary (re)render (incl. language switches). */
(function () {
  'use strict';

  // Each: paths (24x24, stroke style) + a tooltip in en/it.
  var F = {
    '2026-08-01': { en: 'Copper-mining town', it: 'Città mineraria del rame',
      d: '<path d="M4 12h15l-1.5 5H5.5L4 12z"/><path d="M7 12l-1-3H4"/><circle cx="8" cy="20" r="1.3"/><circle cx="15.5" cy="20" r="1.3"/>' },
    '2026-08-02': { en: 'Silver-mining city', it: 'Città mineraria d’argento',
      d: '<path d="M12 3 5 21M12 3l7 18M12 3v18M8 12h8M6.5 16.5h11M4 21h16"/>' },
    '2026-08-03': { en: 'Mad Max film country', it: 'Terra dei film di Mad Max',
      d: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 15h16M8.5 4v16M15.5 4v16"/>' },
    '2026-08-04': { en: 'Woomera rocket range', it: 'Poligono missilistico di Woomera',
      d: '<path d="M12 2c2.6 2 4 5 4 8.5 0 1.8-.6 3.3-1.4 4.5H9.4C8.6 13.8 8 12.3 8 10.5 8 7 9.4 4 12 2z"/><circle cx="12" cy="9" r="1.5"/><path d="M9.4 15l-2.4 3 3-1.2M14.6 15l2.4 3-3-1.2M10.5 18.6h3"/>' },
    '2026-08-05': { en: 'Opal capital', it: 'Capitale dell’opale',
      d: '<path d="M5 9h14l-7 11L5 9z"/><path d="M5 9l3-4h8l3 4M9 9l3 11M15 9l-3 11M8 5l1 4M16 5l-1 4"/>' },
    '2026-08-06': { en: 'Camel country', it: 'Terra dei cammelli',
      d: '<path d="M3 17q2-4.5 4 0 2-4.5 4 0"/><path d="M11 17l1.6-6 3-.6q1.6-.2 1 2"/><path d="M5 17v3M8 17v3M10.5 17v3M12.6 16v4"/>' },
    '2026-08-07': { en: 'West MacDonnell gorges', it: 'Gole delle West MacDonnell',
      d: '<path d="M3 19h18M4 19l5-9 3.5 5 2-3L21 19M9 10l3.5 9"/>' },
    '2026-08-08': { en: 'Outback waterhole', it: 'Pozza d’acqua nell’outback',
      d: '<path d="M3 8c1.7-1.4 3.3-1.4 5 0s3.3 1.4 5 0 3.3-1.4 5 0M3 13c1.7-1.4 3.3-1.4 5 0s3.3 1.4 5 0 3.3-1.4 5 0M3 18c1.7-1.4 3.3-1.4 5 0s3.3 1.4 5 0 3.3-1.4 5 0"/>' },
    '2026-08-09': { en: 'Red Centre hub', it: 'Cuore del Red Centre',
      d: '<path d="M3 21V11l5-3 5 3v10M13 21V7l4-2.5 4 2.5V21M3 21h18M6.5 13H8M6.5 16H8M10 13h1.5M10 16h1.5M16 10h2M16 13h2M16 16h2"/>' },
    '2026-08-10': { en: 'Highway roadhouse', it: 'Roadhouse sulla statale',
      d: '<path d="M5 21V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v15M4 21h11M7 8h4M13 9.5l3 2.5V17a1.5 1.5 0 0 0 3 0V7.5L16.5 5"/>' },
    '2026-08-11': { en: 'Arid botanic gardens', it: 'Giardini botanici aridi',
      d: '<path d="M12 21v-8M12 13c-.5-3-3-4.6-6-4.3.2 3 2.8 5 6 4.3zM12 12c.4-3 2.8-4.7 5.8-4.4-.2 3-2.7 4.9-5.8 4.4z"/>' },
    '2026-08-12': { en: 'Shearing country', it: 'Terra della tosatura',
      d: '<path d="M5.4 6.3 14 12 5.4 17.7M14 12l5.6-3.8M14 12l5.6 3.8"/><circle cx="4" cy="5.5" r="1.6"/><circle cx="4" cy="18.5" r="1.6"/>' },
    '2026-08-13': { en: 'Home beach', it: 'Spiaggia di casa',
      d: '<path d="M3 16c3.6 1.2 6.4-.6 7.7-3.8.8-2-.3-4.2-2.4-4.2C6.4 8 5 9.8 5 12M3 20c3 1 6 1 9 0s6-1 9 0"/>' },
  };

  function svg(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  function render() {
    var it = window.I18N && window.I18N.lang === 'it';
    document.querySelectorAll('.day').forEach(function (day) {
      var place = day.querySelector('.place');
      if (!place || place.querySelector('.place-feat')) return;
      var f = F[day.dataset.date];
      if (!f) return;
      var span = document.createElement('span');
      span.className = 'place-feat';
      span.title = it ? f.it : f.en;
      span.setAttribute('aria-label', it ? f.it : f.en);
      span.innerHTML = svg(f.d);
      // insert before the destination name text node (after the "lead" label)
      var textNode = null, nodes = place.childNodes;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].nodeType === 3 && nodes[i].textContent.trim()) { textNode = nodes[i]; break; }
      }
      if (textNode) place.insertBefore(span, textNode);
      else place.appendChild(span);
    });
  }

  document.addEventListener('itinerary:ready', render);
  if (document.querySelector('.day')) render();
})();

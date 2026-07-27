/* welcome.js — a one-time welcome + how-to popup for people following the trip
   (friends/relatives who have the link but aren't travelling). Shows on the
   first visit only, remembered via localStorage. Bilingual, with an in-popup
   language switch. Load after i18n.js. */
(function () {
  'use strict';
  var KEY = 'travel_welcome_v1';
  var I18N = window.I18N;
  function t(k) { return I18N ? I18N.t(k) : k; }
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  function show() {
    var ov = document.createElement('div');
    ov.className = 'overlay welcome-overlay';

    function render() {
      var lang = I18N ? I18N.lang : 'en';
      ov.innerHTML =
        '<div class="overlay-panel welcome-panel">' +
          '<button class="overlay-close" type="button" aria-label="Close">✕</button>' +
          '<div class="welcome-lang">' +
            '<button type="button" data-wl="en" class="' + (lang === 'en' ? 'on' : '') + '">English</button>' +
            '<button type="button" data-wl="it" class="' + (lang === 'it' ? 'on' : '') + '">Italiano</button>' +
          '</div>' +
          '<h3>' + t('welcome_title') + '</h3>' +
          '<div class="welcome-body">' + t('welcome_body') + '</div>' +
          '<button class="welcome-ok" type="button">' + t('welcome_ok') + '</button>' +
        '</div>';
    }
    render();

    function close() { markSeen(); ov.remove(); }
    ov.addEventListener('click', function (e) {
      var wl = e.target.closest ? e.target.closest('[data-wl]') : null;
      if (wl) { if (I18N && I18N.set) I18N.set(wl.getAttribute('data-wl')); render(); return; }
      if (e.target === ov || e.target.closest('.overlay-close') || e.target.closest('.welcome-ok')) close();
    });
    document.body.appendChild(ov);
  }

  function start() { if (!seen()) show(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

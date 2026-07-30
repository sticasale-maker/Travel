/* settings.js — appearance controls: theme (auto day/night · light · dark) and
   text size (normal · large · larger, for older relatives following along).
   Renders a gear button into #settings-host and a small popover. Applies
   data-theme / data-textsize on <html>. Persists to localStorage. Load after
   i18n.js. Works with no backend. */
(function () {
  'use strict';
  var I18N = window.I18N;
  function t(k) { return I18N ? I18N.t(k) : k; }

  var THEME_KEY = 'travel_theme';      // 'auto' | 'light' | 'dark'
  var SIZE_KEY = 'travel_textsize';    // 'normal' | 'large' | 'larger'

  function get(k, def) { try { return localStorage.getItem(k) || def; } catch (e) { return def; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var theme = get(THEME_KEY, 'auto');
  var size = get(SIZE_KEY, 'normal');

  // Auto = dark at night (18:00–06:59 local), light through the day. Re-checked
  // on load, when the app is refocused, and hourly.
  function isNight() { var h = new Date().getHours(); return h >= 18 || h < 7; }
  function effectiveTheme() { return theme === 'auto' ? (isNight() ? 'dark' : 'light') : theme; }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', effectiveTheme());
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#0f0c09' : '#B65C24');
  }
  function applySize() { document.documentElement.setAttribute('data-textsize', size); }

  applyTheme();
  applySize();

  // Keep auto-theme fresh without a reload.
  setInterval(function () { if (theme === 'auto') applyTheme(); }, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && theme === 'auto') applyTheme();
  });

  function segBtn(group, val, cur, label) {
    return '<button type="button" data-set="' + group + '" data-val="' + val + '"' +
      (val === cur ? ' class="on"' : '') + '>' + label + '</button>';
  }

  function panelHTML() {
    return '<div class="set-row"><span class="set-lbl">' + t('set_theme') + '</span>' +
        '<div class="seg">' +
          segBtn('theme', 'auto', theme, t('set_auto')) +
          segBtn('theme', 'light', theme, '☀️') +
          segBtn('theme', 'dark', theme, '🌙') +
        '</div></div>' +
      '<div class="set-row"><span class="set-lbl">' + t('set_textsize') + '</span>' +
        '<div class="seg seg-size">' +
          segBtn('size', 'normal', size, 'A') +
          segBtn('size', 'large', size, 'A') +
          segBtn('size', 'larger', size, 'A') +
        '</div></div>';
  }

  function render() {
    var host = document.getElementById('settings-host');
    if (!host) return;
    host.innerHTML =
      '<button type="button" class="set-gear" aria-label="' + t('set_title') + '">⚙️</button>' +
      '<div class="set-pop" hidden>' + panelHTML() + '</div>';

    var gear = host.querySelector('.set-gear');
    var pop = host.querySelector('.set-pop');

    function refresh() { pop.innerHTML = panelHTML(); }
    function closePop() { pop.hidden = true; }

    gear.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) refresh();
    });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-set]');
      if (!b) return;
      var group = b.getAttribute('data-set'), val = b.getAttribute('data-val');
      if (group === 'theme') { theme = val; put(THEME_KEY, val); applyTheme(); }
      else if (group === 'size') { size = val; put(SIZE_KEY, val); applySize(); }
      refresh();
    });
    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) closePop();
    });
  }

  function init() { render(); }
  if (I18N && I18N.onChange) I18N.onChange(function () { render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

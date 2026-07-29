/* pull.js — pull-to-refresh for the PWA. Pull down from the top of the page
   to reload: re-fetches the journal/reactions from Supabase and picks up any
   new app version. Only engages at the very top; ignores modals/inputs so it
   never fights normal scrolling or typing. */
(function () {
  'use strict';
  var TH = 68;    // px of (resisted) pull needed to trigger
  var MAX = 96;   // cap on visual travel
  var startY = 0, pulling = false, ready = false, busy = false;

  var ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<div class="ptr-spin"></div>';

  function spin() { return ind.firstChild; }
  function setPull(d) {
    var y = Math.min(d, MAX);
    ind.style.transform = 'translateX(-50%) translateY(' + y + 'px)';
    ind.style.opacity = Math.min(1, d / TH);
    spin().style.transform = 'rotate(' + Math.min(d / TH, 1) * 280 + 'deg)';
    ready = d >= TH;
    ind.classList.toggle('ready', ready);
  }
  function reset() {
    ind.classList.add('snap');
    ind.style.transform = '';
    ind.style.opacity = '';
    ind.classList.remove('ready');
    spin().style.transform = '';
    setTimeout(function () { ind.classList.remove('snap'); }, 220);
    pulling = false; ready = false;
  }

  function onStart(e) {
    if (busy || window.scrollY > 0 || e.touches.length !== 1) return;
    if (e.target.closest('.overlay, .name-modal, .note-form, .lightbox, textarea, input, select, [contenteditable]')) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }
  function onMove(e) {
    if (!pulling || busy) return;
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { if (ready) return; reset(); pulling = false; return; }
    var d = dy * 0.6;              // resistance
    if (d > 6) e.preventDefault(); // engage: suppress native scroll / pull-to-refresh
    setPull(d);
  }
  function onEnd() {
    if (!pulling || busy) return;
    pulling = false;
    if (ready) {
      busy = true;
      ind.classList.remove('snap');
      ind.classList.add('spinning');
      ind.style.transform = 'translateX(-50%) translateY(52px)';
      ind.style.opacity = '1';
      spin().style.transform = '';
      setTimeout(function () { location.reload(); }, 350);
    } else {
      reset();
    }
  }

  function init() {
    document.body.appendChild(ind);
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', function () { if (!busy) reset(); }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

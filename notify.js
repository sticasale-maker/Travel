/* notify.js — Web Push opt-in. A bell in the banner lets each person turn on
   notifications for new journal posts. Subscribes via the service worker and
   stores the subscription in Supabase (push_subscriptions); the notify-new-post
   edge function sends the actual pushes. Load after i18n.js + config.js. */
(function () {
  'use strict';
  var CFG = window.TRAVEL_CONFIG || {};
  var I18N = window.I18N;
  function t(k) { return I18N ? I18N.t(k) : k; }
  var SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var btn;

  var BELL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

  function b64ToU8(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64), arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function personKey() { var a = ''; try { a = localStorage.getItem('travel_active') || ''; } catch (e) {} return a === '__anon__' ? '' : a; }
  function label() { try { return localStorage.getItem('travel_author') || localStorage.getItem('travel_reader_name') || ''; } catch (e) { return ''; } }
  function hdr(extra) {
    var h = { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function storeSub(sub) {
    var j = sub.toJSON();
    return fetch(CFG.SUPABASE_URL + '/rest/v1/push_subscriptions', {
      method: 'POST', headers: hdr({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
        person_key: personKey(), label: label(), updated_at: new Date().toISOString() })
    });
  }
  function removeSub(endpoint) {
    return fetch(CFG.SUPABASE_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint),
      { method: 'DELETE', headers: hdr() });
  }

  function setState(s) {
    if (!btn) return;
    btn.dataset.state = s;
    btn.style.display = (s === 'unsupported') ? 'none' : 'inline-flex';
    btn.title = t(s === 'on' ? 'notify_on' : s === 'blocked' ? 'notify_blocked' : 'notify_off');
    btn.setAttribute('aria-label', btn.title);
  }
  function currentSub() { return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }); }
  var OPTOUT = 'notify_optout';
  function optedOut() { try { return localStorage.getItem(OPTOUT) === '1'; } catch (e) { return false; } }
  function setOptout(v) { try { if (v) localStorage.setItem(OPTOUT, '1'); else localStorage.removeItem(OPTOUT); } catch (e) {} }
  function doSubscribe(reg) {
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.VAPID_PUBLIC_KEY) }).then(storeSub);
  }

  function refresh() {
    if (Notification.permission === 'denied') { setState('blocked'); return; }
    // "On by default": once notifications are allowed on this device (and not
    // explicitly turned off), keep it subscribed — auto-resubscribing if the
    // subscription was lost or accidentally cleared.
    if (Notification.permission === 'granted' && !optedOut()) {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) { storeSub(sub).catch(function () {}); setState('on'); return; }
          return doSubscribe(reg).then(function () { setState('on'); });
        });
      }).catch(function () { setState('off'); });
      return;
    }
    currentSub().then(function (sub) { setState(sub ? 'on' : 'off'); }).catch(function () { setState('off'); });
  }

  function enable() {
    setOptout(false);
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      navigator.serviceWorker.ready.then(doSubscribe).then(function () { setState('on'); }).catch(function () { setState('off'); });
    });
  }
  function disable() {
    setOptout(true);
    currentSub().then(function (sub) {
      if (!sub) { setState('off'); return; }
      var ep = sub.endpoint;
      sub.unsubscribe().catch(function () {}).then(function () { removeSub(ep).catch(function () {}); setState('off'); });
    });
  }
  function onClick() {
    if (btn.dataset.state === 'blocked') { alert(t('notify_blocked_help')); return; }
    if (btn.dataset.state === 'on') { if (confirm(t('notify_off_confirm'))) disable(); return; }
    enable();
  }

  // Default everyone to subscribed: browsers won't let us subscribe silently
  // (and iOS only allows the permission prompt from a user gesture), so on the
  // visitor's FIRST interaction we request permission and subscribe — unless
  // they've already decided or explicitly turned notifications off. Only prompts
  // once per load, so it never nags.
  function autoEnroll() {
    if (!SUPPORTED || !CFG.VAPID_PUBLIC_KEY) return;
    if (Notification.permission !== 'default' || optedOut()) return;
    var evs = ['pointerdown', 'touchend', 'click', 'keydown'], done = false;
    function stop() { evs.forEach(function (ev) { document.removeEventListener(ev, go, true); }); }
    function go() {
      if (done) return; done = true; stop();
      if (Notification.permission === 'default' && !optedOut()) enable();
    }
    evs.forEach(function (ev) { document.addEventListener(ev, go, true); });
  }

  function init() {
    btn = document.getElementById('notify-btn');
    if (!btn) return;
    if (!SUPPORTED || !CFG.VAPID_PUBLIC_KEY) { setState('unsupported'); return; }
    btn.innerHTML = BELL;
    btn.addEventListener('click', onClick);
    refresh();
    autoEnroll();
    if (I18N && I18N.onChange) I18N.onChange(function () { if (btn && btn.dataset.state) setState(btn.dataset.state); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

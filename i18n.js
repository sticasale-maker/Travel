/* i18n.js — English / Italian for the whole app (chrome + journal labels).
   Itinerary *content* lives in itinerary.en.html / itinerary.it.html.
   Load this BEFORE itinerary.js / map.js / notes.js. */
(function () {
  'use strict';

  var STRINGS = {
    en: {
      loading: 'Loading today…',
      jump_today: 'Jump to today ↓',
      // sync status
      sync_synced: 'Synced',
      sync_syncing: 'Saving {n}…',
      sync_offline: 'Offline',
      sync_local: 'Local only',
      reader_tag: 'Read-only',
      // banner
      banner_today: 'Today is <b>{date}</b> · Day {n} of the trip',
      banner_starts_one: 'Trip starts <b>{date}</b> · 1 day to go',
      banner_starts_many: 'Trip starts <b>{date}</b> · {n} days to go',
      banner_complete: 'Trip complete — <b>welcome home</b>',
      banner_today_only: 'Today is <b>{date}</b>',
      // journal (was "notes")
      journal_title: 'Journal',
      add_memory: '+ Add a memory',
      empty_poster: 'No memories yet — tap “Add a memory”.',
      empty_reader: 'No memories yet.',
      badge_pending: 'Saving…',
      badge_you: 'You',
      edit: 'Edit',
      del: 'Delete',
      confirm_delete: 'Delete this memory? This removes its photos too.',
      form_placeholder: 'What do you want to remember about today? Tap the keyboard mic and talk, or type…',
      form_hint: 'Tip: tap the 🎤 on your iPhone keyboard to dictate.',
      save_memory: 'Save memory',
      cancel: 'Cancel',
      translated_from: 'Translated',
      // profile modal
      name_title: 'Your profile',
      name_desc: 'Your name and photo appear on each memory you add.',
      name_ph: '…or type a name',
      name_save: 'Save',
      add_photo: 'Add photo',
      change_photo: 'Change photo',
      // map
      map_directions: 'Tap for directions',
      map_pin: 'Tap · Google Maps',
      // reader note
      reader_note_title: 'How this page works.',
      reader_note_body: 'Anyone with this link can read every memory and photo — it’s unlisted, with no login. Posting, editing and deleting are locked to the travellers’ own app and enforced by the database, so this page is genuinely read-only: you can follow along, but nothing here can be changed from your end. Each traveller edits only their own entries, enforced server-side — solid for a family log, not account-grade security, and there are no passwords to lose in the desert.',
      doc_title_poster: 'Outback Loop · Travel Journal',
      doc_title_reader: 'Outback Loop · Travel Journal (read-only)'
    },
    it: {
      loading: 'Caricamento di oggi…',
      jump_today: 'Vai a oggi ↓',
      sync_synced: 'Sincronizzato',
      sync_syncing: 'Salvo {n}…',
      sync_offline: 'Offline',
      sync_local: 'Solo locale',
      reader_tag: 'Sola lettura',
      banner_today: 'Oggi è <b>{date}</b> · Giorno {n} del viaggio',
      banner_starts_one: 'Il viaggio inizia <b>{date}</b> · manca 1 giorno',
      banner_starts_many: 'Il viaggio inizia <b>{date}</b> · mancano {n} giorni',
      banner_complete: 'Viaggio concluso — <b>bentornati a casa</b>',
      banner_today_only: 'Oggi è <b>{date}</b>',
      journal_title: 'Diario',
      add_memory: '+ Aggiungi un ricordo',
      empty_poster: 'Ancora nessun ricordo — tocca “Aggiungi un ricordo”.',
      empty_reader: 'Ancora nessun ricordo.',
      badge_pending: 'Salvataggio…',
      badge_you: 'Tu',
      edit: 'Modifica',
      del: 'Elimina',
      confirm_delete: 'Eliminare questo ricordo? Verranno rimosse anche le foto.',
      form_placeholder: 'Cosa vuoi ricordare di oggi? Tocca il microfono della tastiera e parla, o scrivi…',
      form_hint: 'Suggerimento: tocca il 🎤 sulla tastiera dell’iPhone per dettare.',
      save_memory: 'Salva ricordo',
      cancel: 'Annulla',
      translated_from: 'Tradotto',
      name_title: 'Il tuo profilo',
      name_desc: 'Il tuo nome e la foto compaiono su ogni ricordo che aggiungi.',
      name_ph: '…o scrivi un nome',
      name_save: 'Salva',
      add_photo: 'Aggiungi foto',
      change_photo: 'Cambia foto',
      map_directions: 'Tocca per le indicazioni',
      map_pin: 'Tocca · Google Maps',
      reader_note_title: 'Come funziona questa pagina.',
      reader_note_body: 'Chiunque abbia questo link può leggere ogni ricordo e foto — è non elencata, senza login. Scrivere, modificare ed eliminare sono riservati all’app dei viaggiatori e imposti dal database, quindi questa pagina è davvero in sola lettura: puoi seguire il viaggio, ma da qui nulla può essere modificato. Ogni viaggiatore modifica solo i propri ricordi, garantito lato server — solido per un diario di famiglia, non sicurezza di livello bancario, e non ci sono password da perdere nel deserto.',
      doc_title_poster: 'Outback Loop · Diario di viaggio',
      doc_title_reader: 'Outback Loop · Diario di viaggio (sola lettura)'
    }
  };

  function detect() {
    var saved = null;
    try { saved = localStorage.getItem('travel_lang'); } catch (e) {}
    if (saved === 'en' || saved === 'it') return saved;
    var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    return nav.indexOf('it') === 0 ? 'it' : 'en';
  }

  var listeners = [];

  var I18N = {
    lang: detect(),
    t: function (key, vars) {
      var dict = STRINGS[I18N.lang] || STRINGS.en;
      var s = dict[key] != null ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
      if (vars) {
        s = s.replace(/\{(\w+)\}/g, function (m, k) {
          return vars[k] != null ? vars[k] : m;
        });
      }
      return s;
    },
    locale: function () { return I18N.lang === 'it' ? 'it-IT' : 'en-AU'; },
    onChange: function (cb) { listeners.push(cb); },
    set: function (lang) {
      if (lang !== 'en' && lang !== 'it') return;
      if (lang === I18N.lang) return;
      I18N.lang = lang;
      try { localStorage.setItem('travel_lang', lang); } catch (e) {}
      document.documentElement.setAttribute('lang', lang);
      applyStatic(document);
      syncToggle();
      listeners.forEach(function (cb) { try { cb(lang); } catch (e) {} });
    },
    apply: function (root) { applyStatic(root || document); }
  };

  // Fill any [data-i18n] (textContent), [data-i18n-html] (innerHTML),
  // [data-i18n-ph] (placeholder), [data-i18n-title] (document.title / title attr).
  function applyStatic(root) {
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = I18N.t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = I18N.t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', I18N.t(el.getAttribute('data-i18n-ph')));
    });
    var titleKey = document.body && document.body.getAttribute('data-doc-title');
    if (titleKey) document.title = I18N.t(titleKey);
  }

  // Inline SVG flags so they render identically on every device (unlike emoji
  // flags, which show as letters on Windows). English = Australian flag.
  var FLAG_AU =
    '<svg viewBox="0 0 60 30" class="flag" aria-hidden="true">' +
      '<rect width="60" height="30" fill="#00247d"/>' +
      '<path d="M0 0L30 15M30 0L0 15" stroke="#fff" stroke-width="3"/>' +
      '<path d="M0 0L30 15M30 0L0 15" stroke="#cf142b" stroke-width="1.2"/>' +
      '<path d="M15 0V15M0 7.5H30" stroke="#fff" stroke-width="5"/>' +
      '<path d="M15 0V15M0 7.5H30" stroke="#cf142b" stroke-width="3"/>' +
      '<circle cx="15" cy="22.5" r="3" fill="#fff"/>' +
      '<circle cx="47" cy="6" r="1.3" fill="#fff"/>' +
      '<circle cx="53.5" cy="13" r="1.3" fill="#fff"/>' +
      '<circle cx="47" cy="24" r="1.3" fill="#fff"/>' +
      '<circle cx="40" cy="15" r="1.3" fill="#fff"/>' +
      '<circle cx="47" cy="15" r="0.8" fill="#fff"/>' +
    '</svg>';
  var FLAG_IT =
    '<svg viewBox="0 0 60 40" class="flag" aria-hidden="true">' +
      '<rect width="20" height="40" fill="#008c45"/>' +
      '<rect x="20" width="20" height="40" fill="#f4f5f0"/>' +
      '<rect x="40" width="20" height="40" fill="#cd212a"/>' +
    '</svg>';

  // A flag toggle rendered into #lang-toggle (Australian ⇄ Italian).
  function renderToggle() {
    var host = document.getElementById('lang-toggle');
    if (!host) return;
    host.innerHTML =
      '<button type="button" data-lang="en" aria-label="English (Australia)">' + FLAG_AU + '</button>' +
      '<button type="button" data-lang="it" aria-label="Italiano">' + FLAG_IT + '</button>';
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]');
      if (b) I18N.set(b.getAttribute('data-lang'));
    });
    syncToggle();
  }
  function syncToggle() {
    var host = document.getElementById('lang-toggle');
    if (!host) return;
    host.querySelectorAll('button[data-lang]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === I18N.lang);
    });
  }

  window.I18N = I18N;

  function init() {
    document.documentElement.setAttribute('lang', I18N.lang);
    renderToggle();
    applyStatic(document);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();

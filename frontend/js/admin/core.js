/* GunWaree admin pages (admin.html, admin-alerts.html, admin-reports.html, admin-hardware.html): what they share.

   The pages use the normal site shell (js/shell.js: sidebar, top bar, account menu, bell, language). The script in
   each page's <head> already sends anyone who is not an admin away before the page is drawn; this file checks again
   (an expired session, logging out, a 403) and provides:
   - helpers for text, numbers and backend times (always Thai wall-clock time, never shifted)
   - GW.admin.api(): requests with the session token, the top-bar status pill, and a 403 sending the person home
   - toasts and a confirm dialog
   - one clock for every refresh: tasks run while the tab is visible
   - the menu badges: alerts waiting for approval, new rescue reports and a running pump, every 30 seconds
   The page's own script registers with GW.admin.view(name, { enter, render }); name = <body data-admin-view>. */

(function (GW) {
  'use strict';

  var L = GW.lang;
  var body = document.body;
  var VIEW = body.getAttribute('data-admin-view');
  var TONE = { none: 'green', watch: 'yellow', warning: 'orange', critical: 'red',
    safe: 'green', medium: 'yellow', high: 'orange', danger: 'red', nodata: 'grey' };

  /* ---------- Small helpers ---------- */

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // Text from the backend or typed by people: marked Thai when it is Thai, so it is read and shaped correctly
  function text(tag, cls, s) {
    var e = h(tag, cls, s);
    if (/[฀-๿]/.test(s || '')) e.lang = 'th';
    return e;
  }

  function locale() { return L.get() === 'th' ? 'th-TH' : 'en-GB'; }

  function num(v, digits) {
    return Number(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function wallValue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN;
  }
  function nowThai() { return Date.now() + 7 * 3600000; }

  function fmt(s, opts) {
    var v = typeof s === 'number' ? s : wallValue(s);
    if (!isFinite(v)) return '';
    opts.timeZone = 'UTC';
    return new Intl.DateTimeFormat(locale(), opts).format(new Date(v));
  }
  function time(s) { return fmt(s, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function clock(s) { return fmt(s, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function clockSec(s) { return fmt(s, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  function date(s) { return fmt(s, { day: 'numeric', month: 'short', year: 'numeric' }); }

  // "12 s ago", "4 min ago", "3 h ago", or the time itself when older than a day
  function ago(s) {
    var v = wallValue(s);
    if (!isFinite(v)) return '';
    var sec = Math.max(0, Math.round((nowThai() - v) / 1000));
    if (sec < 60) return L.t('ad.agoS', { n: sec });
    if (sec < 3600) return L.t('ad.agoM', { n: Math.floor(sec / 60) });
    if (sec < 86400) return L.t('ad.agoH', { n: Math.floor(sec / 3600) });
    return time(s);
  }
  function ageSeconds(s) {
    var v = wallValue(s);
    return isFinite(v) ? (nowThai() - v) / 1000 : Infinity;
  }

  function levelLabel(level) {
    return GW.t.levels[level] ? L.pick(GW.t.levels[level]) : (level || '');
  }

  // A small coloured label: <span class="tag tag--red">Critical</span>
  function tag(label, tone) { return h('span', 'tag tag--' + (tone || 'grey'), label); }

  function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /* ---------- Who is signed in ---------- */

  function isAdmin() {
    var s = GW.session.get();
    return !!(s && s.role === 'admin');
  }

  // Logged out here, or the session changed in another tab: leave the admin pages
  function leave() {
    var s = GW.session.get();
    window.location.replace(s ? GW.url('home') : GW.authUrl('login'));
  }

  /* ---------- Status pill in the top bar ---------- */

  var statusEl = $('[data-status]');
  var connecting = false;
  var online = null;
  function renderStatus() {
    if (!statusEl) return;
    var mode = online === false ? 'sample' : online ? 'live' : connecting ? 'connecting' : '';
    if (!mode) { statusEl.textContent = ''; return; }
    statusEl.setAttribute('data-mode', mode);
    statusEl.textContent = mode === 'sample' ? L.t('ad.offline') : mode === 'live' ? L.t('status.live') : L.t('status.connecting');
  }

  /* ---------- Requests ---------- */

  // Every admin request: the token is sent, slow answers show "connecting", a 401 goes to log in (GW.request)
  // and a 403 (signed in, but not as an admin) leaves the admin pages
  function api(path, opts) {
    opts = opts || {};
    opts.onSlow = function () { connecting = true; renderStatus(); };
    return GW.request(path, opts).then(function (data) {
      online = true;
      connecting = false;
      renderStatus();
      return data;
    }, function (err) {
      connecting = false;
      online = err.kind === 'http';
      renderStatus();
      if (err.status === 403 && /^\/admin\//.test(path)) leave();
      throw err;
    });
  }

  function messageFor(err, overrides) { return GW.messageFor(err, overrides); }

  /* ---------- Toasts and the confirm dialog ---------- */

  var toasts = $('[data-toasts]');
  function toast(msg, tone) {
    var t = h('p', 'toast toast--' + (tone || 'ok'), msg);
    toasts.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { t.remove(); }, 350);
    }, tone === 'error' ? 6500 : 4200);
  }

  var dlg = $('[data-confirm]');
  // confirm({ title, text, ok, cancel, tone: 'danger', preview: Node }) resolves true when confirmed
  function confirm(o) {
    if (!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(o.title + '\n\n' + (o.text || '')));
    $('[data-confirm-title]', dlg).textContent = o.title;
    $('[data-confirm-text]', dlg).textContent = o.text || '';
    var prev = $('[data-confirm-preview]', dlg);
    prev.textContent = '';
    prev.hidden = !o.preview;
    if (o.preview) prev.appendChild(o.preview);
    var ok = $('[data-confirm-ok]', dlg);
    ok.textContent = o.ok;
    ok.className = 'btn-a ' + (o.tone === 'danger' ? 'btn-a--danger' : 'btn-a--primary');
    $('[data-confirm-cancel]', dlg).textContent = o.cancel || L.t('ad.cancel');
    dlg.returnValue = '';
    dlg.showModal();
    ok.focus();
    return new Promise(function (resolve) {
      dlg.addEventListener('close', function () { resolve(dlg.returnValue === 'ok'); }, { once: true });
    });
  }

  /* ---------- One clock for every refresh ---------- */

  var tasks = [];
  var started = false;

  // every(ms, fn): fn runs when the page starts (or when asked) and again every ms while the tab is visible
  function every(ms, fn) {
    var task = { ms: ms, fn: fn, last: 0, busy: false };
    tasks.push(task);
    return {
      now: function () { run(task, true); },   // run right away, even if it ran a moment ago
      due: function () { run(task, false); }   // run only if it has never run or its time has come
    };
  }
  function run(task, force) {
    if (task.busy || !started) return;
    if (!force && (document.hidden || Date.now() - task.last < task.ms)) return;
    task.busy = true;
    task.last = Date.now();
    var done = function () { task.busy = false; };
    try {
      var p = task.fn();
      if (p && typeof p.then === 'function') p.then(done, done); else done();
    } catch (e) { done(); throw e; }
  }
  setInterval(function () {
    if (!started) return;
    // Live refreshes off: nothing runs on its own (the clocks still tick); a task can still be run on purpose (.now())
    if (GW.live.on()) tasks.forEach(function (t) { run(t, false); });
    document.dispatchEvent(new CustomEvent('adm:tick'));
  }, 1000);

  /* ---------- Menu badges: what is waiting ---------- */

  var counts = { alerts: null, reports: null, pump: null, pending: [], incidents: null };

  function setBadge(key, n) {
    $$('[data-badge="' + key + '"]').forEach(function (el) {
      var was = !el.hidden;
      el.hidden = !n;
      if (key !== 'pump') el.textContent = n > 99 ? '99+' : String(n || '');
      if (n && !was && !reduceMotion()) { el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }
    });
  }

  function renderCounts() {
    setBadge('alerts', counts.alerts);
    setBadge('reports', counts.reports);
    setBadge('pump', counts.pump && counts.pump.pump === 'on' ? 1 : 0);
    document.dispatchEvent(new CustomEvent('adm:counts'));
  }

  function loadCounts() {
    return Promise.all([
      api('/admin/alerts?status=pending').then(function (list) {
        counts.pending = list || [];
        counts.alerts = counts.pending.length;
      }, function () { /* the badge keeps its last value */ }),
      api('/admin/incidents').then(function (list) {
        counts.incidents = list || [];
        counts.reports = counts.incidents.filter(function (r) { return r.status === 'new'; }).length;
      }, function () { /* keep */ }),
      api('/admin/pump-status?region=bangkok_test').then(function (st) { counts.pump = st; }, function () { /* keep */ })
    ]).then(renderCounts);
  }
  var countsTask = every(30 * 1000, loadCounts);

  // Pages report fresher numbers when they have them, so the badges never lag behind the page
  function setIncidents(list) {
    counts.incidents = list;
    counts.reports = list.filter(function (r) { return r.status === 'new'; }).length;
    renderCounts();
  }
  function setPending(list) {
    counts.pending = list;
    counts.alerts = list.length;
    renderCounts();
  }
  function setPump(st) {
    counts.pump = st;
    renderCounts();
  }

  /* ---------- The page ---------- */

  var view = null;

  document.addEventListener('gw:lang', function () {
    renderStatus();
    if (view && view.render) view.render();
  });
  document.addEventListener('gw:session', function () { if (!isAdmin()) leave(); });
  document.addEventListener('gw:live', function (e) { if (e.detail.on && started) tasks.forEach(function (t) { run(t, true); }); });

  GW.admin = {
    $: $, $$: $$, h: h, text: text, num: num, time: time, clock: clock, clockSec: clockSec, date: date, ago: ago,
    ageSeconds: ageSeconds, wallValue: wallValue, nowThai: nowThai, levelLabel: levelLabel, tag: tag,
    reduceMotion: reduceMotion, TONE: TONE,
    api: api, messageFor: messageFor, toast: toast, confirm: confirm, every: every,
    counts: counts, refreshCounts: function () { countsTask.now(); },
    setIncidents: setIncidents, setPending: setPending, setPump: setPump,
    view: function (name, def) { if (name === VIEW) view = def; },
    current: function () { return VIEW; }
  };

  // The page's own script loads after this one; start once it has registered
  document.addEventListener('DOMContentLoaded', function () {
    if (!isAdmin()) { leave(); return; }
    started = true;
    renderStatus();
    if (view && view.enter) view.enter();
    countsTask.now();
  });
})(window.GW = window.GW || {});
